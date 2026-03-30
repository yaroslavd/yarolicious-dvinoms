import { Router, type IRouter } from "express";
import { eq, isNull, and } from "drizzle-orm";
import { db, recipesTable } from "@workspace/db";
import { scoreRecipeForAllProfiles } from "../dietary";
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
} from "@workspace/api-zod";
import { scrapeRecipeFromUrl, generateRecipeWithAI } from "../../lib/recipe-scraper";
import {
  downloadAndStoreImage,
  getStoredImage,
  extractStoredImageFilename,
} from "../../lib/imageStorage";

/**
 * Returns true if the imageUrl is one of our self-hosted stored image URLs.
 * Stored URLs look like: https://<domain>/api/recipes/image/<filename>
 */
function isStoredImageUrl(imageUrl: string | null | undefined): boolean {
  return extractStoredImageFilename(imageUrl) !== null;
}

const router: IRouter = Router();

router.get("/recipes", async (req, res): Promise<void> => {
  const recipes = await db
    .select()
    .from(recipesTable)
    .where(isNull(recipesTable.deletedAt))
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

  let imageUrl: string | null = parsed.data.imageUrl ?? null;

  if (imageUrl && !isStoredImageUrl(imageUrl)) {
    req.log.info(`[image-storage] Downloading image at recipe create: ${imageUrl}`);
    const storedUrl = await downloadAndStoreImage(imageUrl);
    if (storedUrl) {
      imageUrl = storedUrl;
      req.log.info(`[image-storage] Image stored, serving from: ${storedUrl}`);
    } else {
      req.log.warn(`[image-storage] Could not store image — saving recipe without image`);
      imageUrl = null;
    }
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
      imageUrl,
      categories: parsed.data.categories ?? null,
      difficulty: parsed.data.difficulty ?? null,
      originType: parsed.data.originType ?? null,
      generationPrompt: parsed.data.generationPrompt ?? null,
    })
    .returning();

  res.status(201).json(GetRecipeResponse.parse(recipe));

  setImmediate(async () => {
    try {
      await scoreRecipeForAllProfiles(recipe.id, recipe.ingredients, recipe.directions);
    } catch (err) {
      req.log.warn({ err }, `Failed to score new recipe ${recipe.id} against dietary profiles`);
    }
  });
});

/**
 * GET /api/recipes/image/:filename
 * Streams a stored recipe image from object storage.
 * The imageUrl column in the DB for stored images points to this endpoint.
 */
router.get("/recipes/image/:filename", async (req, res): Promise<void> => {
  const { filename } = req.params;
  if (!filename || filename.includes("..") || filename.includes("/")) {
    res.status(400).json({ error: "Invalid image filename" });
    return;
  }

  const image = await getStoredImage(filename);

  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  res.setHeader("Content-Type", image.contentType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  if (image.contentLength !== undefined) {
    res.setHeader("Content-Length", String(image.contentLength));
  }
  image.stream.pipe(res);
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
    .where(and(eq(recipesTable.id, params.data.id), isNull(recipesTable.deletedAt)));

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

  let updateData: typeof parsed.data = parsed.data;

  if (
    parsed.data.imageUrl !== undefined &&
    parsed.data.imageUrl !== null &&
    !isStoredImageUrl(parsed.data.imageUrl)
  ) {
    req.log.info(`[image-storage] Downloading image at recipe update: ${parsed.data.imageUrl}`);
    const storedUrl = await downloadAndStoreImage(parsed.data.imageUrl);
    if (storedUrl) {
      req.log.info(`[image-storage] Image stored, serving from: ${storedUrl}`);
      updateData = { ...parsed.data, imageUrl: storedUrl };
    } else {
      req.log.warn(`[image-storage] Could not store updated image — setting imageUrl to null`);
      updateData = { ...parsed.data, imageUrl: null };
    }
  }

  const [recipe] = await db
    .update(recipesTable)
    .set({
      ...updateData,
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
    .update(recipesTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(recipesTable.id, params.data.id), isNull(recipesTable.deletedAt)))
    .returning();

  if (!recipe) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/recipes/:id/restore", async (req, res): Promise<void> => {
  const params = DeleteRecipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [recipe] = await db
    .update(recipesTable)
    .set({ deletedAt: null })
    .where(eq(recipesTable.id, params.data.id))
    .returning();

  if (!recipe) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
