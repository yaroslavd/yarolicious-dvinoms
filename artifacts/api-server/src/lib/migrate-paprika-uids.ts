import { db, paprikaCredentialsTable, recipesTable } from "@workspace/db";
import { deterministicRecipeUid, deleteFromPaprika } from "./paprika";
import { logger } from "./logger";

/**
 * One-time idempotent startup migration for deterministic Paprika UIDs.
 *
 * Background: previously, syncing a recipe with no stored UID generated a random
 * UUID, creating a new Paprika entry instead of updating the existing one.
 * This migration ensures every recipe's `paprika_uid` in the DB matches the
 * deterministic value derived from its DB primary key, preventing future duplicates.
 *
 * Steps:
 *  1. For each recipe, compute deterministicRecipeUid(recipe.id).
 *  2. If the stored UID differs, update the DB row.
 *  3. If Paprika credentials are available and the old UID was non-null, also
 *     delete the stale Paprika entry so duplicates don't linger.
 *
 * This is safe to run on every server start — recipes already using their
 * deterministic UID are skipped with no DB or Paprika calls.
 */
export async function migratePaprikaUids(): Promise<void> {
  const log = logger.child({ migration: "migratePaprikaUids" });

  const recipes = await db.select().from(recipesTable);
  if (recipes.length === 0) return;

  // Optionally load credentials for Paprika-side cleanup
  const [creds] = await db.select().from(paprikaCredentialsTable).limit(1);
  const password = creds
    ? Buffer.from(creds.encryptedPassword, "base64").toString("utf-8")
    : null;

  let updated = 0;
  let paprikaDeleted = 0;

  for (const recipe of recipes) {
    const correctUid = deterministicRecipeUid(recipe.id);

    if (recipe.paprikaUid === correctUid) {
      continue; // already correct — skip
    }

    const oldUid = recipe.paprikaUid;

    // Update DB to use the deterministic UID
    const { eq } = await import("drizzle-orm");
    await db
      .update(recipesTable)
      .set({ paprikaUid: correctUid, updatedAt: new Date() })
      .where(eq(recipesTable.id, recipe.id));

    updated++;
    log.info({ recipeId: recipe.id, oldUid, newUid: correctUid }, "Updated recipe paprika_uid to deterministic value");

    // If we have credentials and there was a stale Paprika entry, delete it
    if (creds && password && oldUid) {
      try {
        await deleteFromPaprika(creds.email, password, oldUid);
        paprikaDeleted++;
        log.info({ uid: oldUid, recipeId: recipe.id }, "Deleted stale Paprika entry");
      } catch (err: any) {
        log.warn({ uid: oldUid, err: err.message }, "Could not delete stale Paprika entry — skipping");
      }
    }
  }

  if (updated > 0) {
    log.info({ updated, paprikaDeleted }, "Paprika UID migration complete");
  }
}
