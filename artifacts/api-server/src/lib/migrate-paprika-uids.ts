import { eq } from "drizzle-orm";
import { db, recipesTable } from "@workspace/db";
import { deterministicRecipeUid } from "./paprika";
import { logger } from "./logger";

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
 *
 * This is safe to run on every server start — recipes already using their
 * deterministic UID are skipped. No Paprika-side changes are made automatically.
 */
export async function migratePaprikaUids(): Promise<void> {
  const log = logger.child({ migration: "migratePaprikaUids" });

  const recipes = await db.select().from(recipesTable);
  if (recipes.length === 0) return;

  let dbUpdated = 0;

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
  }

  if (dbUpdated > 0) {
    log.info({ dbUpdated }, "Paprika UID migration complete");
  }
}
