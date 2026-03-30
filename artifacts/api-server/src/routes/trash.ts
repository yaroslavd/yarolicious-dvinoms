import { Router, type IRouter } from "express";
import { eq, isNotNull } from "drizzle-orm";
import {
  db,
  recipesTable,
  dietaryProfilesTable,
  recipeVersionsTable,
} from "@workspace/db";

const router: IRouter = Router();

function parseId(raw: unknown): number | null {
  const n = parseInt(String(raw), 10);
  return isNaN(n) || n <= 0 ? null : n;
}

router.get("/trash", async (_req, res): Promise<void> => {
  const [recipes, profiles, versionsWithRecipe] = await Promise.all([
    db
      .select({
        id: recipesTable.id,
        name: recipesTable.name,
        description: recipesTable.description,
        deletedAt: recipesTable.deletedAt,
      })
      .from(recipesTable)
      .where(isNotNull(recipesTable.deletedAt))
      .orderBy(recipesTable.deletedAt),

    db
      .select({
        id: dietaryProfilesTable.id,
        name: dietaryProfilesTable.name,
        description: dietaryProfilesTable.description,
        deletedAt: dietaryProfilesTable.deletedAt,
      })
      .from(dietaryProfilesTable)
      .where(isNotNull(dietaryProfilesTable.deletedAt))
      .orderBy(dietaryProfilesTable.deletedAt),

    db
      .select({
        id: recipeVersionsTable.id,
        recipeId: recipeVersionsTable.recipeId,
        recipeName: recipesTable.name,
        label: recipeVersionsTable.label,
        deletedAt: recipeVersionsTable.deletedAt,
      })
      .from(recipeVersionsTable)
      .innerJoin(
        recipesTable,
        eq(recipeVersionsTable.recipeId, recipesTable.id),
      )
      .where(isNotNull(recipeVersionsTable.deletedAt))
      .orderBy(recipeVersionsTable.deletedAt),
  ]);

  res.json({ recipes, profiles, versions: versionsWithRecipe });
});

router.delete("/trash/recipes/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db
    .delete(recipesTable)
    .where(eq(recipesTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }
  res.sendStatus(204);
});

router.delete("/trash/profiles/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db
    .delete(dietaryProfilesTable)
    .where(eq(dietaryProfilesTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.sendStatus(204);
});

router.delete("/trash/versions/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [deleted] = await db
    .delete(recipeVersionsTable)
    .where(eq(recipeVersionsTable.id, id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Version not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
