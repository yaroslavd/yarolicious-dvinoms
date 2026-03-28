import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, paprikaCredentialsTable, recipesTable } from "@workspace/db";
import {
  GetPaprikaCredentialsResponse,
  SetPaprikaCredentialsBody,
  SetPaprikaCredentialsResponse,
  GetPaprikaCategoriesResponse,
  CategorizationPreviewResponse,
  CategorizationApplyBody,
  CategorizationApplyResponse,
} from "@workspace/api-zod";
import {
  validatePaprikaCredentials,
  fetchPaprikaCategories,
  syncRecipeToPaprika,
} from "../lib/paprika";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

router.get("/paprika/credentials", async (_req, res): Promise<void> => {
  const [creds] = await db
    .select()
    .from(paprikaCredentialsTable)
    .limit(1);

  if (!creds) {
    res.json(GetPaprikaCredentialsResponse.parse({ configured: false, email: null }));
    return;
  }

  res.json(GetPaprikaCredentialsResponse.parse({ configured: true, email: creds.email }));
});

router.post("/paprika/credentials", async (req, res): Promise<void> => {
  const parsed = SetPaprikaCredentialsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password.trim();
  const encryptedPassword = Buffer.from(password, "utf-8").toString("base64");

  const existing = await db.select().from(paprikaCredentialsTable).limit(1);

  if (existing.length > 0) {
    await db
      .update(paprikaCredentialsTable)
      .set({ email, encryptedPassword, updatedAt: new Date() })
      .where(eq(paprikaCredentialsTable.id, existing[0].id));
  } else {
    await db.insert(paprikaCredentialsTable).values({ email, encryptedPassword });
  }

  res.json(SetPaprikaCredentialsResponse.parse({ configured: true, email }));
});

router.post("/paprika/test", async (_req, res): Promise<void> => {
  const [creds] = await db.select().from(paprikaCredentialsTable).limit(1);

  if (!creds) {
    res.status(400).json({ success: false, message: "No credentials configured. Add them in Settings first." });
    return;
  }

  const password = Buffer.from(creds.encryptedPassword, "base64").toString("utf-8");
  const result = await validatePaprikaCredentials(creds.email, password);

  if (result.valid) {
    res.json({ success: true, message: `Connected successfully as ${creds.email}` });
  } else {
    res.status(401).json({ success: false, message: `Connection failed: ${result.error ?? "Invalid credentials"}` });
  }
});

router.get("/paprika/categories", async (_req, res): Promise<void> => {
  const [creds] = await db.select().from(paprikaCredentialsTable).limit(1);

  if (!creds) {
    res.status(400).json({ error: "No Paprika credentials configured. Add them in Settings first." });
    return;
  }

  const password = Buffer.from(creds.encryptedPassword, "base64").toString("utf-8");

  try {
    const raw = await fetchPaprikaCategories(creds.email, password);
    const categories = raw.map((c) => ({ uid: c.uid, name: c.name }));
    res.json(GetPaprikaCategoriesResponse.parse({ categories }));
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Failed to fetch categories" });
  }
});

router.post("/paprika/categorize-preview", async (_req, res): Promise<void> => {
  const [creds] = await db.select().from(paprikaCredentialsTable).limit(1);

  if (!creds) {
    res.status(400).json({ error: "No Paprika credentials configured. Add them in Settings first." });
    return;
  }

  const password = Buffer.from(creds.encryptedPassword, "base64").toString("utf-8");

  // Fetch all recipes and live Paprika categories in parallel
  const [recipes, rawCategories] = await Promise.all([
    db.select().from(recipesTable).orderBy(recipesTable.id),
    fetchPaprikaCategories(creds.email, password),
  ]);

  if (recipes.length === 0) {
    res.status(400).json({ error: "No recipes found. Import some recipes first." });
    return;
  }

  const categories = rawCategories.map((c) => ({ uid: c.uid, name: c.name }));

  // Build a concise recipe list for the AI prompt
  const recipeList = recipes.map((r) => ({
    id: r.id,
    name: r.name,
    source: r.source ?? "",
    sourceUrl: r.sourceUrl ?? "",
    ingredientsSummary: (r.ingredients ?? "").split("\n").slice(0, 8).join(", "),
    currentCategories: r.categories
      ? r.categories.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
  }));

  const categoryList = categories.map((c) => `- ${c.name} (uid: ${c.uid})`).join("\n");
  const recipeJson = JSON.stringify(recipeList, null, 2);

  const systemPrompt = `You are a recipe categorization assistant. You assign Paprika recipe categories to recipes.

Available categories (use ONLY these names and UIDs):
${categoryList}

Assignment rules:
- NYTimes: assign if sourceUrl contains "nytimes.com"
- ChatGPT: assign if source is "AI Generated" or sourceUrl is empty/null
- Soups: soups, stews, broths, chowders, bisques, borscht
- Cakes: cakes, cupcakes, layer cakes
- Ice Cream: ice cream, gelato, sorbet, frozen desserts
- Air Fryer: recipes that use an air fryer
- Meal Prep: batch cooking, make-ahead dishes, meal prep

For each recipe, return only the categories that should be ADDED (do not include categories already in currentCategories). If none apply, return an empty array.

Return ONLY a JSON object with this exact structure:
{"results": [{"recipeId": <number>, "categoryNames": ["Name1", "Name2"]}]}

Use only category names from the available list above. Return one entry per recipe even if the array is empty.`;

  const userPrompt = `Categorize these recipes:\n${recipeJson}`;

  let aiResults: { recipeId: number; categoryNames: string[] }[] = [];

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 4096,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { results: { recipeId: number; categoryNames: string[] }[] };
    aiResults = parsed.results ?? [];
  } catch (err: any) {
    res.status(500).json({ error: `AI categorization failed: ${err.message}` });
    return;
  }

  // Build a map of category name -> { uid, name } for lookup
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  // Build suggestion list
  const suggestions = recipes.map((recipe) => {
    const aiEntry = aiResults.find((r) => r.recipeId === recipe.id);
    const suggestedNames = aiEntry?.categoryNames ?? [];

    const currentCategories = recipe.categories
      ? recipe.categories.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const currentLower = new Set(currentCategories.map((c) => c.toLowerCase()));

    // Resolve names to category objects, filter out already-existing ones
    const toAdd = suggestedNames
      .map((name) => categoryByName.get(name.toLowerCase()))
      .filter((c): c is { uid: string; name: string } => !!c && !currentLower.has(c.name.toLowerCase()));

    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      currentCategories,
      toAdd,
    };
  });

  res.json(CategorizationPreviewResponse.parse({ suggestions }));
});

router.post("/paprika/categorize-apply", async (req, res): Promise<void> => {
  const parsed = CategorizationApplyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [creds] = await db.select().from(paprikaCredentialsTable).limit(1);

  if (!creds) {
    res.status(400).json({ error: "No Paprika credentials configured. Add them in Settings first." });
    return;
  }

  const password = Buffer.from(creds.encryptedPassword, "base64").toString("utf-8");

  // Re-fetch live Paprika categories to ensure UIDs are current
  let liveCategories: { uid: string; name: string }[];
  try {
    const raw = await fetchPaprikaCategories(creds.email, password);
    liveCategories = raw.map((c) => ({ uid: c.uid, name: c.name }));
  } catch (err: any) {
    res.status(500).json({ error: `Failed to fetch live Paprika categories: ${err.message}` });
    return;
  }

  // Build both lookup directions: UID → category (primary, rename-safe) and name → category (fallback)
  const categoryByUid = new Map(liveCategories.map((c) => [c.uid.toLowerCase(), c]));
  const categoryByName = new Map(liveCategories.map((c) => [c.name.toLowerCase(), c]));

  const applications = parsed.data.applications;
  let applied = 0;
  const errors: string[] = [];

  for (const app of applications) {
    if (app.categoryUids.length === 0) continue;

    try {
      // Load recipe from DB
      const [recipe] = await db
        .select()
        .from(recipesTable)
        .where(eq(recipesTable.id, app.recipeId))
        .limit(1);

      if (!recipe) {
        errors.push(`Recipe ${app.recipeId} not found`);
        continue;
      }

      // Existing category names in DB
      const existingNames = recipe.categories
        ? recipe.categories.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
      const existingLower = new Set(existingNames.map((n) => n.toLowerCase()));

      // Resolve additions: use submitted UIDs as source of truth (rename-safe).
      // Look up current live name by UID; fall back to name lookup if UID no longer found.
      // Track seen UIDs and names to deduplicate within the batch.
      const seenUids = new Set<string>();
      const seenNames = new Set<string>(existingLower);
      const additions: { uid: string; name: string }[] = [];
      for (let i = 0; i < app.categoryUids.length; i++) {
        const uid = app.categoryUids[i];
        const submittedName = app.categoryNames[i] ?? "";
        const live = categoryByUid.get(uid.toLowerCase());
        const resolved = live ?? categoryByName.get(submittedName.toLowerCase());
        if (!resolved) continue; // category was deleted from Paprika — skip
        if (seenUids.has(resolved.uid.toLowerCase())) continue; // dedupe by UID
        if (seenNames.has(resolved.name.toLowerCase())) continue; // dedupe by name vs existing
        seenUids.add(resolved.uid.toLowerCase());
        seenNames.add(resolved.name.toLowerCase());
        additions.push(resolved);
      }

      // Strictly deduplicated merged names (existing + new additions only)
      const mergedNames = [...existingNames, ...additions.map((a) => a.name)];

      // Build full UID set for Paprika sync:
      // - UIDs for newly added categories (resolved above)
      // - UIDs for existing DB category names that resolve to a live Paprika category
      const syncUidSet = new Set<string>(additions.map((a) => a.uid));
      for (const name of existingNames) {
        const live = categoryByName.get(name.toLowerCase());
        if (live) syncUidSet.add(live.uid);
      }
      const mergedUids = Array.from(syncUidSet);

      // Update DB with deduplicated merged names
      await db
        .update(recipesTable)
        .set({
          categories: mergedNames.join(", "),
          updatedAt: new Date(),
        })
        .where(eq(recipesTable.id, app.recipeId));

      // Sync to Paprika — always (export if new, update if already exported)
      const syncResult = await syncRecipeToPaprika(creds.email, password, {
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
        difficulty: recipe.difficulty,
        existingUid: recipe.paprikaUid ?? undefined,
        categoryUids: mergedUids,
      });

      if (syncResult.success) {
        // Persist UID and mark exported (in case this was the first sync)
        await db
          .update(recipesTable)
          .set({ exportedToPaprika: true, paprikaUid: syncResult.uid, updatedAt: new Date() })
          .where(eq(recipesTable.id, app.recipeId));
      } else {
        errors.push(`Recipe "${recipe.name}": Paprika sync failed — ${syncResult.message}`);
      }

      applied++;
    } catch (err: any) {
      errors.push(`Recipe ${app.recipeId}: ${err.message}`);
    }
  }

  res.json(CategorizationApplyResponse.parse({ applied, errors }));
});

export default router;
