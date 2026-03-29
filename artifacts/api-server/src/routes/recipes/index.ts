import { Router, type IRouter } from "express";
import { eq, isNull, and } from "drizzle-orm";
import { db, recipesTable, paprikaCredentialsTable } from "@workspace/db";
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
  ExportRecipeToPaprikaParams,
  ExportRecipeToPaprikaResponse,
} from "@workspace/api-zod";
import zlib from "zlib";
import { randomUUID, createHash } from "crypto";
import { scrapeRecipeFromUrl, generateRecipeWithAI } from "../../lib/recipe-scraper";
import { syncRecipeToPaprika } from "../../lib/paprika";
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

async function fetchImageAsBase64ForFile(
  url: string,
  log: { warn: (msg: string) => void }
): Promise<{ data: string; hash: string; filename: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      log.warn(`[paprika-file] Image fetch failed for URL "${url}": HTTP ${res.status}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const data = buf.toString("base64");
    const hash = createHash("sha256").update(buf).digest("hex");
    let filename = "photo.jpg";
    try {
      const ext = new URL(url).pathname.split(".").pop()?.toLowerCase();
      if (ext && ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
        filename = `photo.${ext}`;
      }
    } catch {
      // ignore
    }
    return { data, hash, filename };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`[paprika-file] Image fetch error for URL "${url}": ${message}`);
    return null;
  }
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
      exportedToPaprika: false,
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

router.get("/recipes/:id/paprika-file", async (req, res): Promise<void> => {
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

  const uid = randomUUID();

  let photo = "";
  let photoHash: string | null = null;
  let photoFilename: string | null = null;
  if (recipe.imageUrl) {
    const img = await fetchImageAsBase64ForFile(recipe.imageUrl, {
      warn: (msg) => req.log.warn(msg),
    });
    if (img) {
      photo = img.data;
      photoHash = img.hash;
      photoFilename = img.filename;
      req.log.info(`[paprika] Image embedded in .paprikarecipe file for recipe id=${recipe.id}`);
    } else {
      req.log.warn(`[paprika] Could not embed image for recipe id=${recipe.id} (url=${recipe.imageUrl})`);
    }
  }

  const paprikaRecipe = {
    uid,
    name: recipe.name,
    description: recipe.description ?? "",
    ingredients: recipe.ingredients,
    directions: recipe.directions,
    servings: recipe.servings ?? "",
    total_time: recipe.totalTime ?? "",
    prep_time: recipe.prepTime ?? "",
    cook_time: recipe.cookTime ?? "",
    notes: recipe.notes ?? "",
    nutritional_info: recipe.nutritionalInfo ?? "",
    source: recipe.source ?? "",
    source_url: recipe.sourceUrl ?? "",
    image_url: recipe.imageUrl ?? "",
    categories: recipe.categories ? recipe.categories.split(",").map((c: string) => c.trim()) : [],
    difficulty: recipe.difficulty ?? "",
    rating: 0,
    on_favorites: false,
    in_trash: false,
    hash: uid,
    photo,
    photo_hash: photoHash,
    photo_filename: photoFilename,
    photo_large: null,
    scale: null,
  };

  const jsonBuf = Buffer.from(JSON.stringify(paprikaRecipe), "utf-8");
  const gzipped = await new Promise<Buffer>((resolve, reject) => {
    zlib.gzip(jsonBuf, (err, result) => (err ? reject(err) : resolve(result)));
  });

  const safeName = recipe.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}.paprikarecipe"`);
  res.send(gzipped);
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

  if (recipe.imageUrl) {
    req.log.info(
      `[paprika] Syncing recipe id=${recipe.id} with image URL: ${recipe.imageUrl}`
    );
  } else {
    req.log.info(`[paprika] Syncing recipe id=${recipe.id} without image`);
  }

  try {
    const result = await syncRecipeToPaprika(creds.email, password, {
      dbId: recipe.id,
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

      if (result.imageEmbedded) {
        req.log.info(
          `[paprika] Image successfully embedded in Paprika payload for recipe id=${recipe.id}`
        );
      } else if (recipe.imageUrl) {
        req.log.warn(
          `[paprika] Image could NOT be embedded in Paprika payload for recipe id=${recipe.id} (url=${recipe.imageUrl}) — recipe synced without image`
        );
      }
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
