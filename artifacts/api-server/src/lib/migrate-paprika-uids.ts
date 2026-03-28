import { eq } from "drizzle-orm";
import { db, paprikaCredentialsTable, recipesTable } from "@workspace/db";
import { deterministicRecipeUid, deleteFromPaprika } from "./paprika";
import { logger } from "./logger";

/**
 * Known stale Paprika UIDs created by the old random-UUID sync logic.
 * These were stored in Paprika but the DB paprika_uid column was reset to NULL
 * during testing, so they cannot be recovered from the DB alone. They must be
 * cleaned up explicitly. The list is safe to re-run: Paprika returns 200/404
 * for already-deleted entries (deleteFromPaprika treats 404 as success).
 *
 * These are the four UIDs that accumulated for recipe 1 before the deterministic
 * UID fix was applied. They all correspond to "One-Pot Orzo and Meatballs".
 */
const KNOWN_STALE_PAPRIKA_UIDS: string[] = [
  "63986a0b-0850-4289-bbea-a789daec947d",
  "7e21765d-da4a-4c89-ae6d-d77c5f5a87d3",
  "97af98a2-4602-491f-9765-c659d1c170ea",
  "c90e9074-e3b3-49d9-ac32-bff728412d02",
];

/**
 * One-time idempotent startup migration for deterministic Paprika UIDs.
 *
 * Background: previously, syncing a recipe with no stored UID generated a random
 * UUID, creating a new Paprika entry instead of updating the existing one.
 * This migration ensures every recipe's paprika_uid in the DB matches the
 * deterministic value derived from its DB primary key, preventing future duplicates.
 *
 * Steps:
 *  1. For each recipe, compute deterministicRecipeUid(recipe.id).
 *  2. If the stored UID differs (or is null), update the DB row.
 *  3. If Paprika credentials are available and the old UID was non-null and different
 *     from the new one, delete the stale Paprika entry.
 *  4. If credentials are available, explicitly clean up KNOWN_STALE_PAPRIKA_UIDS
 *     that cannot be recovered from DB history (DB was reset to NULL for these).
 *     Skips any UID that matches a recipe's deterministic UID.
 *
 * This is safe to run on every server start — recipes already using their
 * deterministic UID are skipped. Paprika deletes are idempotent (404 = already gone).
 */
export async function migratePaprikaUids(): Promise<void> {
  const log = logger.child({ migration: "migratePaprikaUids" });

  const recipes = await db.select().from(recipesTable);
  if (recipes.length === 0) return;

  // Compute all deterministic UIDs upfront for use in stale-UID filtering
  const deterministicUids = new Set(recipes.map((r) => deterministicRecipeUid(r.id)));

  // Load credentials for Paprika-side cleanup (optional)
  const [creds] = await db.select().from(paprikaCredentialsTable).limit(1);
  const password = creds
    ? Buffer.from(creds.encryptedPassword, "base64").toString("utf-8")
    : null;

  let dbUpdated = 0;
  let paprikaDeleted = 0;

  // Step 1 & 2: DB migration — ensure every recipe uses its deterministic UID
  for (const recipe of recipes) {
    const correctUid = deterministicRecipeUid(recipe.id);

    if (recipe.paprikaUid === correctUid) {
      continue; // already correct — skip
    }

    const oldUid = recipe.paprikaUid;

    await db
      .update(recipesTable)
      .set({ paprikaUid: correctUid, updatedAt: new Date() })
      .where(eq(recipesTable.id, recipe.id));

    dbUpdated++;
    log.info({ recipeId: recipe.id, oldUid, newUid: correctUid }, "Updated recipe paprika_uid to deterministic value");

    // Step 3: delete stale Paprika entry if credentials are available
    if (creds && password && oldUid) {
      try {
        await deleteFromPaprika(creds.email, password, oldUid);
        paprikaDeleted++;
        log.info({ uid: oldUid, recipeId: recipe.id }, "Deleted stale Paprika entry (DB-tracked)");
      } catch (err: any) {
        log.warn({ uid: oldUid, err: err.message }, "Could not delete stale Paprika entry — skipping");
      }
    }
  }

  // Step 4: explicit cleanup of known stale UIDs that were reset to NULL in DB
  // (cannot be recovered from DB history, must be hardcoded)
  if (creds && password) {
    for (const uid of KNOWN_STALE_PAPRIKA_UIDS) {
      // Skip if this UID happens to match a valid deterministic UID
      if (deterministicUids.has(uid)) {
        log.info({ uid }, "Skipping known stale UID — matches a current deterministic UID");
        continue;
      }

      try {
        await deleteFromPaprika(creds.email, password, uid);
        paprikaDeleted++;
        log.info({ uid }, "Deleted known stale Paprika duplicate (hardcoded list)");
      } catch (err: any) {
        log.warn({ uid, err: err.message }, "Could not delete known stale Paprika entry — skipping");
      }
    }
  }

  if (dbUpdated > 0 || paprikaDeleted > 0) {
    log.info({ dbUpdated, paprikaDeleted }, "Paprika UID migration complete");
  }
}
