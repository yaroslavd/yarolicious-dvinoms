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
import zlib from "zlib";
import { randomUUID, createHash } from "crypto";
import { scrapeRecipeFromUrl, generateRecipeWithAI } from "../../lib/recipe-scraper";
import { syncRecipeToPaprika } from "../../lib/paprika";

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
  } catch (err: any) {
    log.warn(`[paprika-file] Image fetch error for URL "${url}": ${err?.message ?? err}`);
    return null;
  }
}

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

  // Embed image if available
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
