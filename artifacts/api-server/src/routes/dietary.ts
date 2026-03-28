import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  dietaryProfilesTable,
  recipeComplianceScoresTable,
  recipesTable,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  CreateDietaryProfileBody,
  UpdateDietaryProfileParams,
  UpdateDietaryProfileBody,
  DeleteDietaryProfileParams,
  ComputeComplianceScoreBody,
  GetRecipeComplianceScoresParams,
  GetDietarySuggestionsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function computeComplianceScoreForRecipeAndProfile(
  ingredients: string,
  directions: string,
  profileDescription: string
): Promise<{ score: number; reason: string }> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 512,
    messages: [
      {
        role: "system",
        content: `You are a dietary compliance evaluator. Given a recipe's ingredients and directions, evaluate how well the recipe complies with a dietary profile description. Return a JSON object with:
- score: integer 0-100 (100 = fully compliant, 0 = completely non-compliant)
- reason: string (1-2 sentences explaining the score, e.g. "82% — contains whole grains, low sugar, but uses white pasta")

Return ONLY the JSON object, no markdown.`,
      },
      {
        role: "user",
        content: `Dietary profile: ${profileDescription}

Recipe ingredients:
${ingredients}

Recipe directions:
${directions}

Evaluate compliance and return { score, reason }.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { score?: number; reason?: string };
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  return {
    score: Math.min(100, Math.max(0, Math.round(parsed.score ?? 50))),
    reason: parsed.reason ?? "Unable to evaluate compliance.",
  };
}

router.get("/dietary-profiles", async (req, res): Promise<void> => {
  const profiles = await db
    .select()
    .from(dietaryProfilesTable)
    .orderBy(dietaryProfilesTable.createdAt);
  res.json(profiles);
});

router.post("/dietary-profiles", async (req, res): Promise<void> => {
  const parsed = CreateDietaryProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .insert(dietaryProfilesTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(profile);

  setImmediate(async () => {
    try {
      const recipes = await db.select().from(recipesTable);
      for (const recipe of recipes) {
        try {
          const result = await computeComplianceScoreForRecipeAndProfile(
            recipe.ingredients,
            recipe.directions,
            profile.description
          );
          await db
            .insert(recipeComplianceScoresTable)
            .values({
              recipeId: recipe.id,
              profileId: profile.id,
              score: result.score,
              reason: result.reason,
            })
            .onConflictDoNothing();
        } catch (err) {
          req.log.warn({ err }, `Failed to score recipe ${recipe.id} for new profile ${profile.id}`);
        }
      }
    } catch (err) {
      req.log.error({ err }, "Failed to score recipes for new profile");
    }
  });
});

router.patch("/dietary-profiles/:id", async (req, res): Promise<void> => {
  const params = UpdateDietaryProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateDietaryProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .update(dietaryProfilesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(dietaryProfilesTable.id, params.data.id))
    .returning();

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(profile);

  setImmediate(async () => {
    try {
      const recipes = await db.select().from(recipesTable);
      for (const recipe of recipes) {
        try {
          const result = await computeComplianceScoreForRecipeAndProfile(
            recipe.ingredients,
            recipe.directions,
            profile.description
          );
          await db
            .delete(recipeComplianceScoresTable)
            .where(
              and(
                eq(recipeComplianceScoresTable.recipeId, recipe.id),
                eq(recipeComplianceScoresTable.profileId, profile.id)
              )
            );
          await db.insert(recipeComplianceScoresTable).values({
            recipeId: recipe.id,
            profileId: profile.id,
            score: result.score,
            reason: result.reason,
          });
        } catch (err) {
          req.log.warn({ err }, `Failed to re-score recipe ${recipe.id} for profile ${profile.id}`);
        }
      }
    } catch (err) {
      req.log.error({ err }, "Failed to re-score recipes for updated profile");
    }
  });
});

router.delete("/dietary-profiles/:id", async (req, res): Promise<void> => {
  const params = DeleteDietaryProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [profile] = await db
    .delete(dietaryProfilesTable)
    .where(eq(dietaryProfilesTable.id, params.data.id))
    .returning();

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/recipes/compliance-score", async (req, res): Promise<void> => {
  const parsed = ComputeComplianceScoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const result = await computeComplianceScoreForRecipeAndProfile(
      parsed.data.ingredients,
      parsed.data.directions,
      parsed.data.profileDescription
    );

    await db
      .delete(recipeComplianceScoresTable)
      .where(
        and(
          eq(recipeComplianceScoresTable.recipeId, parsed.data.recipeId),
          eq(recipeComplianceScoresTable.profileId, parsed.data.profileId)
        )
      );

    await db.insert(recipeComplianceScoresTable).values({
      recipeId: parsed.data.recipeId,
      profileId: parsed.data.profileId,
      score: result.score,
      reason: result.reason,
    });

    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Failed to compute compliance score");
    res.status(500).json({ error: err.message ?? "Failed to compute score" });
  }
});

router.get("/recipes/compliance-scores/bulk", async (req, res): Promise<void> => {
  const scores = await db
    .select({
      id: recipeComplianceScoresTable.id,
      recipeId: recipeComplianceScoresTable.recipeId,
      profileId: recipeComplianceScoresTable.profileId,
      profileName: dietaryProfilesTable.name,
      score: recipeComplianceScoresTable.score,
      reason: recipeComplianceScoresTable.reason,
      updatedAt: recipeComplianceScoresTable.updatedAt,
    })
    .from(recipeComplianceScoresTable)
    .innerJoin(
      dietaryProfilesTable,
      eq(recipeComplianceScoresTable.profileId, dietaryProfilesTable.id)
    );
  res.json(scores);
});

router.get("/recipes/:id/compliance-scores", async (req, res): Promise<void> => {
  const params = GetRecipeComplianceScoresParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const scores = await db
    .select({
      id: recipeComplianceScoresTable.id,
      recipeId: recipeComplianceScoresTable.recipeId,
      profileId: recipeComplianceScoresTable.profileId,
      profileName: dietaryProfilesTable.name,
      score: recipeComplianceScoresTable.score,
      reason: recipeComplianceScoresTable.reason,
      updatedAt: recipeComplianceScoresTable.updatedAt,
    })
    .from(recipeComplianceScoresTable)
    .innerJoin(
      dietaryProfilesTable,
      eq(recipeComplianceScoresTable.profileId, dietaryProfilesTable.id)
    )
    .where(eq(recipeComplianceScoresTable.recipeId, params.data.id));

  res.json(scores);
});

router.post("/recipes/dietary-suggestions", async (req, res): Promise<void> => {
  const parsed = GetDietarySuggestionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { recipe, profiles } = parsed.data;

  if (profiles.length === 0) {
    res.json({ suggestions: [] });
    return;
  }

  const profilesText = profiles
    .map((p: { name: string; description: string }) => `- ${p.name}: ${p.description}`)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content: `You are a dietary adaptation expert. Given a recipe and dietary profiles, suggest specific, actionable ingredient or technique swaps to better meet the dietary needs. Return a JSON object with a "suggestions" array where each item has:
- field: string (e.g. "ingredients" or "directions")
- original: string (the specific ingredient/step to change)
- suggested: string (the replacement)
- reason: string (why this change helps)
- profileName: string (which profile this suggestion benefits)

Provide 3-6 concrete, realistic suggestions. Return ONLY the JSON object, no markdown.`,
        },
        {
          role: "user",
          content: `Recipe: ${recipe.name}
${recipe.description ? `Description: ${recipe.description}` : ""}

Ingredients:
${recipe.ingredients}

Directions:
${recipe.directions}

Dietary Profiles:
${profilesText}

Suggest specific swaps to better fit these dietary needs.`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "{}";
    let parsed2: { suggestions?: unknown[] };
    try {
      parsed2 = JSON.parse(content);
    } catch {
      parsed2 = { suggestions: [] };
    }

    const suggestions = Array.isArray(parsed2.suggestions)
      ? parsed2.suggestions
      : [];

    res.json({ suggestions });
  } catch (err: any) {
    req.log.error({ err }, "Failed to get dietary suggestions");
    res.status(500).json({ error: err.message ?? "Failed to get suggestions" });
  }
});

export async function scoreRecipeForAllProfiles(
  recipeId: number,
  ingredients: string,
  directions: string
): Promise<void> {
  const profiles = await db.select().from(dietaryProfilesTable);
  for (const profile of profiles) {
    try {
      const result = await computeComplianceScoreForRecipeAndProfile(
        ingredients,
        directions,
        profile.description
      );
      await db
        .delete(recipeComplianceScoresTable)
        .where(
          and(
            eq(recipeComplianceScoresTable.recipeId, recipeId),
            eq(recipeComplianceScoresTable.profileId, profile.id)
          )
        );
      await db.insert(recipeComplianceScoresTable).values({
        recipeId,
        profileId: profile.id,
        score: result.score,
        reason: result.reason,
      });
    } catch {
      // Silently skip failed individual scores
    }
  }
}

export default router;
