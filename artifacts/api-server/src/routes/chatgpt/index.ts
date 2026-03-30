import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import {
  db,
  chatgptPendingRecipesTable,
  apiKeysTable,
  recipesTable,
} from "@workspace/db";
import {
  ChatgptImportBody,
  ListPendingRecipesResponse,
  ChatgptPendingRecipeParams,
  GetApiKeyResponse,
  RegenerateApiKeyResponse,
  ChatgptImportResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function hashKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function maskKey(rawKey: string): string {
  return `...${rawKey.slice(-4)}`;
}

async function validateBearerToken(
  authHeader: string | undefined,
): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const hashed = hashKey(token);
  const [key] = await db.select().from(apiKeysTable).limit(1);
  return !!key && key.hashedKey === hashed;
}

router.post("/chatgpt/import", async (req, res): Promise<void> => {
  const isValid = await validateBearerToken(req.headers.authorization);
  if (!isValid) {
    res
      .status(401)
      .json({ error: "Unauthorized. Invalid or missing API key." });
    return;
  }

  const parsed = ChatgptImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [pending] = await db
    .insert(chatgptPendingRecipesTable)
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
      status: "pending",
    })
    .returning();

  res.status(201).json(
    ChatgptImportResponse.parse({
      message: `Recipe "${parsed.data.name}" has been queued for review in your Culinary Agent. Open the app to confirm or dismiss it.`,
      id: pending.id,
    }),
  );
});

router.get("/chatgpt/pending", async (_req, res): Promise<void> => {
  const pending = await db
    .select()
    .from(chatgptPendingRecipesTable)
    .where(eq(chatgptPendingRecipesTable.status, "pending"))
    .orderBy(chatgptPendingRecipesTable.createdAt);

  res.json(ListPendingRecipesResponse.parse(pending));
});

router.post("/chatgpt/pending/:id/confirm", async (req, res): Promise<void> => {
  const params = ChatgptPendingRecipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [pending] = await db
    .select()
    .from(chatgptPendingRecipesTable)
    .where(eq(chatgptPendingRecipesTable.id, params.data.id));

  if (!pending) {
    res.status(404).json({ error: "Pending recipe not found" });
    return;
  }

  await db.insert(recipesTable).values({
    name: pending.name,
    description: pending.description ?? null,
    ingredients: pending.ingredients,
    directions: pending.directions,
    servings: pending.servings ?? null,
    totalTime: pending.totalTime ?? null,
    prepTime: pending.prepTime ?? null,
    cookTime: pending.cookTime ?? null,
    notes: pending.notes ?? null,
    nutritionalInfo: pending.nutritionalInfo ?? null,
    source: pending.source ?? null,
    sourceUrl: pending.sourceUrl ?? null,
    imageUrl: pending.imageUrl ?? null,
    categories: pending.categories ?? null,
    difficulty: pending.difficulty ?? null,
  });

  await db
    .delete(chatgptPendingRecipesTable)
    .where(eq(chatgptPendingRecipesTable.id, params.data.id));

  res.sendStatus(204);
});

router.delete("/chatgpt/pending/:id", async (req, res): Promise<void> => {
  const params = ChatgptPendingRecipeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(chatgptPendingRecipesTable)
    .where(eq(chatgptPendingRecipesTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Pending recipe not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/chatgpt/api-key", async (_req, res): Promise<void> => {
  const [key] = await db.select().from(apiKeysTable).limit(1);
  res.json(
    GetApiKeyResponse.parse({
      configured: !!key,
      maskedKey: key ? key.maskedKey : null,
    }),
  );
});

router.post("/chatgpt/api-key/regenerate", async (_req, res): Promise<void> => {
  const rawKey = randomBytes(32).toString("hex");
  const hashed = hashKey(rawKey);
  const masked = maskKey(rawKey);

  const existing = await db.select().from(apiKeysTable).limit(1);

  if (existing.length > 0) {
    await db
      .update(apiKeysTable)
      .set({ hashedKey: hashed, maskedKey: masked, updatedAt: new Date() })
      .where(eq(apiKeysTable.id, existing[0].id));
  } else {
    await db
      .insert(apiKeysTable)
      .values({ hashedKey: hashed, maskedKey: masked });
  }

  res.json(
    RegenerateApiKeyResponse.parse({
      apiKey: rawKey,
      maskedKey: masked,
    }),
  );
});

export default router;
