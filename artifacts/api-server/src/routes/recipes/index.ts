import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, recipesTable, paprikaCredentialsTable } from "@workspace/db";
import {
  ListRecipesResponse,
  GetRecipeResponse,
  GetRecipeParams,
  CreateRecipeBody,
  UpdateRecipeParams,
  UpdateRecipeBody,
  UpdateRecipeResponse,
  DeleteRecipeParams,
  ImportRecipeFromUrlBody,
  ImportRecipeFromUrlResponse,
  GenerateRecipeBody,
  GenerateRecipeResponse,
  ExportRecipeToPaprikaParams,
  ExportRecipeToPaprikaResponse,
} from "@workspace/api-zod";
import { scrapeRecipeFromUrl, generateRecipeWithAI } from "../../lib/recipe-scraper";
import { syncRecipeToPaprika } from "../../lib/paprika";

const router: IRouter = Router();

router.get("/recipes", async (req, res): Promise<void> => {
  const recipes = await db
    .select()
    .from(recipesTable)
    .orderBy(recipesTable.createdAt);
  res.json(ListRecipesResponse.parse(recipes));
});

router.post("/recipes/import-url", async (req, res): Promise<void> => {
  const parsed = ImportRecipeFromUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const recipe = await scrapeRecipeFromUrl(parsed.data.url);
    res.json(ImportRecipeFromUrlResponse.parse(recipe));
  } catch (err: any) {
    req.log.error({ err }, "Failed to import recipe from URL");
    res.status(400).json({ error: err.message ?? "Failed to fetch recipe" });
  }
});

router.post("/recipes/generate", async (req, res): Promise<void> => {
  const parsed = GenerateRecipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const recipe = await generateRecipeWithAI(
      parsed.data.description,
      parsed.data.preferences
    );
    res.json(GenerateRecipeResponse.parse(recipe));
  } catch (err: any) {
    req.log.error({ err }, "Failed to generate recipe");
    res.status(400).json({ error: err.message ?? "Failed to generate recipe" });
  }
});

router.post("/recipes", async (req, res): Promise<void> => {
  const parsed = CreateRecipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [recipe] = await db
    .insert(recipesTable)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      ingredients: parsed.data.ingredients,
      directions: parsed.data.directions,
      servings: parsed.data.servings ?? null,
      totalTime: parsed.data.totalTime ?? null,
      prepTime: parsed.data.prepTime ?? null,
      cookTime: parsed.data.cookTime ?? null,
      notes: parsed.data.notes ?? null,
      nutritionalInfo: parsed.data.nutritionalInfo ?? null,
      source: parsed.data.source ?? null,
      sourceUrl: parsed.data.sourceUrl ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      categories: parsed.data.categories ?? null,
      difficulty: parsed.data.difficulty ?? null,
      exportedToPaprika: false,
    })
    .returning();

  res.status(201).json(GetRecipeResponse.parse(recipe));
});

router.get("/recipes/:id", async (req, res): Promise<void> => {
  const params = GetRecipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [recipe] = await db
    .select()
    .from(recipesTable)
    .where(eq(recipesTable.id, params.data.id));

  if (!recipe) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  res.json(GetRecipeResponse.parse(recipe));
});

router.patch("/recipes/:id", async (req, res): Promise<void> => {
  const params = UpdateRecipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateRecipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [recipe] = await db
    .update(recipesTable)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(recipesTable.id, params.data.id))
    .returning();

  if (!recipe) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  res.json(UpdateRecipeResponse.parse(recipe));
});

router.delete("/recipes/:id", async (req, res): Promise<void> => {
  const params = DeleteRecipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [recipe] = await db
    .delete(recipesTable)
    .where(eq(recipesTable.id, params.data.id))
    .returning();

  if (!recipe) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/recipes/:id/export-to-paprika", async (req, res): Promise<void> => {
  const params = ExportRecipeToPaprikaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [recipe] = await db
    .select()
    .from(recipesTable)
    .where(eq(recipesTable.id, params.data.id));

  if (!recipe) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  const [creds] = await db
    .select()
    .from(paprikaCredentialsTable)
    .orderBy(paprikaCredentialsTable.updatedAt)
    .limit(1);

  if (!creds) {
    res.status(400).json({
      error: "Paprika credentials not configured. Please add them in Settings.",
    });
    return;
  }

  const password = Buffer.from(creds.encryptedPassword, "base64").toString("utf-8");

  try {
    const result = await syncRecipeToPaprika(creds.email, password, {
      name: recipe.name,
      description: recipe.description,
      ingredients: recipe.ingredients,
      directions: recipe.directions,
      servings: recipe.servings,
      totalTime: recipe.totalTime,
      prepTime: recipe.prepTime,
      cookTime: recipe.cookTime,
      notes: recipe.notes,
      nutritionalInfo: recipe.nutritionalInfo,
      source: recipe.source,
      sourceUrl: recipe.sourceUrl,
      imageUrl: recipe.imageUrl,
      categories: recipe.categories,
      difficulty: recipe.difficulty,
    });

    if (result.success) {
      await db
        .update(recipesTable)
        .set({ exportedToPaprika: true, paprikaUid: result.uid, updatedAt: new Date() })
        .where(eq(recipesTable.id, params.data.id));
    }

    res.json(
      ExportRecipeToPaprikaResponse.parse({
        success: result.success,
        message: result.message,
        paprikaUid: result.uid || null,
      })
    );
  } catch (err: any) {
    req.log.error({ err }, "Failed to export to Paprika");
    res.json(
      ExportRecipeToPaprikaResponse.parse({
        success: false,
        message: err.message ?? "Export failed",
        paprikaUid: null,
      })
    );
  }
});

export default router;
