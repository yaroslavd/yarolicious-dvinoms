import { Router, type IRouter } from "express";
import { eq, and, isNull, inArray } from "drizzle-orm";
import {
  db,
  dietaryProfilesTable,
  recipeComplianceScoresTable,
  recipesTable,
  recipeVersionsTable,
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
  ComplianceFixPreviewParams,
  ComplianceFixPreviewBody,
  SaveComplianceVersionParams,
  SaveComplianceVersionBody,
  ListRecipeVersionsParams,
  GetRecipeVersionParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function computeComplianceScoreForRecipeAndProfile(
  ingredients: string,
  directions: string,
  profileDescription: string,
): Promise<{ score: number; reason: string; pros: string[]; cons: string[] }> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 800,
    messages: [
      {
        role: "system",
        content: `You are a dietary compliance evaluator. Given a recipe's ingredients and directions, evaluate how well it complies with a dietary profile. Return a JSON object with:
- score: integer 0-100 (100 = fully compliant, 0 = completely non-compliant)
- reason: string (1-2 sentences summarizing the score)
- pros: array of 1-3 short strings — specific things in this recipe that ARE compliant with the profile (e.g. "High protein from sausage", "Uses olive oil, a healthy fat"). If score is 0, set pros to [].
- cons: array of 1-3 short strings — specific things in this recipe that VIOLATE the profile (e.g. "Contains orzo pasta, a refined carb", "High sodium from chorizo"). If score is 100, set cons to [].

Return ONLY the JSON object, no markdown.`,
      },
      {
        role: "user",
        content: `Dietary profile: ${profileDescription}

Recipe ingredients:
${ingredients}

Recipe directions:
${directions}

Evaluate compliance and return { score, reason, pros, cons }.`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  let parsed: {
    score?: number;
    reason?: string;
    pros?: unknown;
    cons?: unknown;
  };
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  const score = Math.min(100, Math.max(0, Math.round(parsed.score ?? 50)));
  const pros = Array.isArray(parsed.pros)
    ? (parsed.pros as string[]).slice(0, 3)
    : [];
  const cons = Array.isArray(parsed.cons)
    ? (parsed.cons as string[]).slice(0, 3)
    : [];

  return {
    score,
    reason: parsed.reason ?? "Unable to evaluate compliance.",
    pros,
    cons,
  };
}

router.get("/dietary-profiles", async (req, res): Promise<void> => {
  const profiles = await db
    .select()
    .from(dietaryProfilesTable)
    .where(isNull(dietaryProfilesTable.deletedAt))
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
            profile.description,
          );
          await db
            .insert(recipeComplianceScoresTable)
            .values({
              recipeId: recipe.id,
              profileId: profile.id,
              score: result.score,
              reason: result.reason,
              prosList: result.pros,
              consList: result.cons,
            })
            .onConflictDoNothing();
        } catch (err) {
          req.log.warn(
            { err },
            `Failed to score recipe ${recipe.id} for new profile ${profile.id}`,
          );
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
            profile.description,
          );
          await db
            .delete(recipeComplianceScoresTable)
            .where(
              and(
                eq(recipeComplianceScoresTable.recipeId, recipe.id),
                eq(recipeComplianceScoresTable.profileId, profile.id),
                isNull(recipeComplianceScoresTable.versionId),
              ),
            );
          await db.insert(recipeComplianceScoresTable).values({
            recipeId: recipe.id,
            profileId: profile.id,
            score: result.score,
            reason: result.reason,
            prosList: result.pros,
            consList: result.cons,
          });
        } catch (err) {
          req.log.warn(
            { err },
            `Failed to re-score recipe ${recipe.id} for profile ${profile.id}`,
          );
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
    .update(dietaryProfilesTable)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(dietaryProfilesTable.id, params.data.id),
        isNull(dietaryProfilesTable.deletedAt),
      ),
    )
    .returning();

  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.sendStatus(204);
});

router.post(
  "/dietary-profiles/:id/restore",
  async (req, res): Promise<void> => {
    const params = DeleteDietaryProfileParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [profile] = await db
      .update(dietaryProfilesTable)
      .set({ deletedAt: null })
      .where(eq(dietaryProfilesTable.id, params.data.id))
      .returning();

    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    res.sendStatus(204);
  },
);

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
      parsed.data.profileDescription,
    );

    await db
      .delete(recipeComplianceScoresTable)
      .where(
        and(
          eq(recipeComplianceScoresTable.recipeId, parsed.data.recipeId),
          eq(recipeComplianceScoresTable.profileId, parsed.data.profileId),
          isNull(recipeComplianceScoresTable.versionId),
        ),
      );

    await db.insert(recipeComplianceScoresTable).values({
      recipeId: parsed.data.recipeId,
      profileId: parsed.data.profileId,
      score: result.score,
      reason: result.reason,
      prosList: result.pros,
      consList: result.cons,
    });

    res.json(result);
  } catch (err: any) {
    req.log.error({ err }, "Failed to compute compliance score");
    res.status(500).json({ error: err.message ?? "Failed to compute score" });
  }
});

router.get(
  "/recipes/compliance-scores/bulk",
  async (req, res): Promise<void> => {
    const scores = await db
      .select({
        id: recipeComplianceScoresTable.id,
        recipeId: recipeComplianceScoresTable.recipeId,
        profileId: recipeComplianceScoresTable.profileId,
        profileName: dietaryProfilesTable.name,
        score: recipeComplianceScoresTable.score,
        reason: recipeComplianceScoresTable.reason,
        prosList: recipeComplianceScoresTable.prosList,
        consList: recipeComplianceScoresTable.consList,
        updatedAt: recipeComplianceScoresTable.updatedAt,
      })
      .from(recipeComplianceScoresTable)
      .innerJoin(
        dietaryProfilesTable,
        eq(recipeComplianceScoresTable.profileId, dietaryProfilesTable.id),
      )
      .where(isNull(recipeComplianceScoresTable.versionId));
    res.json(scores);
  },
);

router.get(
  "/recipes/:id/compliance-scores",
  async (req, res): Promise<void> => {
    const params = GetRecipeComplianceScoresParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const versionId = req.query.versionId
      ? parseInt(req.query.versionId as string, 10)
      : null;

    const conditions = [
      eq(recipeComplianceScoresTable.recipeId, params.data.id),
    ];
    if (versionId) {
      conditions.push(eq(recipeComplianceScoresTable.versionId, versionId));
    } else {
      conditions.push(isNull(recipeComplianceScoresTable.versionId));
    }

    const scores = await db
      .select({
        id: recipeComplianceScoresTable.id,
        recipeId: recipeComplianceScoresTable.recipeId,
        profileId: recipeComplianceScoresTable.profileId,
        profileName: dietaryProfilesTable.name,
        score: recipeComplianceScoresTable.score,
        reason: recipeComplianceScoresTable.reason,
        prosList: recipeComplianceScoresTable.prosList,
        consList: recipeComplianceScoresTable.consList,
        updatedAt: recipeComplianceScoresTable.updatedAt,
      })
      .from(recipeComplianceScoresTable)
      .innerJoin(
        dietaryProfilesTable,
        eq(recipeComplianceScoresTable.profileId, dietaryProfilesTable.id),
      )
      .where(and(...conditions));

    res.json(scores);
  },
);

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
    .map(
      (p: { name: string; description: string }) =>
        `- ${p.name}: ${p.description}`,
    )
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

router.post(
  "/recipes/:id/compliance-fix-preview",
  async (req, res): Promise<void> => {
    const params = ComplianceFixPreviewParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = ComplianceFixPreviewBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
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

    const selectedProfiles =
      body.data.profileIds.length > 0
        ? await db
            .select()
            .from(dietaryProfilesTable)
            .where(inArray(dietaryProfilesTable.id, body.data.profileIds))
        : [];

    if (selectedProfiles.length === 0) {
      res.status(400).json({ error: "No valid profiles selected" });
      return;
    }

    try {
      const profilesText = selectedProfiles
        .map((p) => `- ${p.name}: ${p.description}`)
        .join("\n");

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_completion_tokens: 2048,
        messages: [
          {
            role: "system",
            content: `You are a dietary compliance expert. Given a recipe and dietary profiles to optimize for, suggest specific ingredient or technique swaps that STRICTLY IMPROVE compliance. Every suggestion must make the recipe MORE compliant — never less. For each suggestion, provide:
- field: "ingredients" or "directions"
- original: the exact text to replace (must be a substring present in the recipe)
- suggested: the replacement text
- description: plain-language explanation, e.g. "Replace orzo with quinoa to reduce refined carbs"
- profileName: which profile this benefits most

Rules:
- Only suggest swaps that genuinely improve dietary compliance — never add disallowed ingredients or worsen any score
- Prefer realistic, widely-available substitutions
- Do not suggest removing an item unless a direct replacement is provided

Return a JSON object with a "suggestions" array (3-6 items). Return ONLY the JSON object, no markdown.`,
          },
          {
            role: "user",
            content: `Recipe: ${recipe.name}

Ingredients:
${recipe.ingredients}

Directions:
${recipe.directions}

Dietary profiles to optimize for:
${profilesText}

Suggest swaps to improve compliance with these profiles.`,
          },
        ],
      });

      const content = completion.choices[0]?.message?.content ?? "{}";
      let aiResult: { suggestions?: unknown[] };
      try {
        aiResult = JSON.parse(content);
      } catch {
        aiResult = { suggestions: [] };
      }

      const rawSuggestions = Array.isArray(aiResult.suggestions)
        ? aiResult.suggestions
        : [];

      const suggestions: {
        field: string;
        original: string;
        suggested: string;
        description: string;
        profileName: string;
        scoreBefore: number;
        scoreAfter: number;
      }[] = [];

      let modifiedIngredients = recipe.ingredients;
      let modifiedDirections = recipe.directions;

      for (const raw of rawSuggestions) {
        const s = raw as {
          field?: string;
          original?: string;
          suggested?: string;
          description?: string;
          profileName?: string;
        };
        if (!s.field || !s.original || !s.suggested) continue;
        suggestions.push({
          field: s.field,
          original: s.original,
          suggested: s.suggested,
          description:
            s.description ?? `Replace "${s.original}" with "${s.suggested}"`,
          profileName: s.profileName ?? selectedProfiles[0].name,
          scoreBefore: 0,
          scoreAfter: 0,
        });
        if (s.field === "ingredients") {
          modifiedIngredients = modifiedIngredients.replace(
            s.original,
            s.suggested,
          );
        } else if (s.field === "directions") {
          modifiedDirections = modifiedDirections.replace(
            s.original,
            s.suggested,
          );
        }
      }

      const projectedScores: {
        profileId: number;
        profileName: string;
        scoreBefore: number;
        scoreAfter: number;
      }[] = [];

      for (const profile of selectedProfiles) {
        const [beforeResult, afterResult] = await Promise.all([
          computeComplianceScoreForRecipeAndProfile(
            recipe.ingredients,
            recipe.directions,
            profile.description,
          ),
          computeComplianceScoreForRecipeAndProfile(
            modifiedIngredients,
            modifiedDirections,
            profile.description,
          ),
        ]);

        const scoreBefore = beforeResult.score;
        const scoreAfter = Math.max(scoreBefore, afterResult.score);

        projectedScores.push({
          profileId: profile.id,
          profileName: profile.name,
          scoreBefore,
          scoreAfter,
        });

        for (const suggestion of suggestions) {
          if (suggestion.profileName === profile.name) {
            suggestion.scoreBefore = scoreBefore;
            suggestion.scoreAfter = scoreAfter;
          }
        }
      }

      res.json({ suggestions, projectedScores });
    } catch (err: any) {
      req.log.error({ err }, "Failed to compute compliance fix preview");
      res
        .status(500)
        .json({ error: err.message ?? "Failed to compute preview" });
    }
  },
);

router.post(
  "/recipes/:id/compliance-versions",
  async (req, res): Promise<void> => {
    const params = SaveComplianceVersionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const body = SaveComplianceVersionBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
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

    const existingVersions = await db
      .select()
      .from(recipeVersionsTable)
      .where(
        and(
          eq(recipeVersionsTable.recipeId, params.data.id),
          isNull(recipeVersionsTable.deletedAt),
        ),
      );

    const labelConflict = existingVersions.some(
      (v) =>
        v.label.trim().toLowerCase() === body.data.label.trim().toLowerCase(),
    );
    if (labelConflict) {
      res.status(409).json({
        error: `A version named "${body.data.label}" already exists. Please choose a different name.`,
      });
      return;
    }

    let newIngredients = recipe.ingredients;
    let newDirections = recipe.directions;

    for (const suggestion of body.data.suggestions) {
      if (suggestion.field === "ingredients") {
        newIngredients = newIngredients.replace(
          suggestion.original,
          suggestion.suggested,
        );
      } else if (suggestion.field === "directions") {
        newDirections = newDirections.replace(
          suggestion.original,
          suggestion.suggested,
        );
      }
    }

    if (existingVersions.length === 0) {
      await db.insert(recipeVersionsTable).values({
        recipeId: params.data.id,
        label: "Original",
        ingredients: recipe.ingredients,
        directions: recipe.directions,
        isOriginal: true,
      });
    }

    const [version] = await db
      .insert(recipeVersionsTable)
      .values({
        recipeId: params.data.id,
        label: body.data.label,
        ingredients: newIngredients,
        directions: newDirections,
        isOriginal: false,
      })
      .returning();

    res.status(201).json(version);

    setImmediate(async () => {
      try {
        await scoreVersionForAllProfiles(
          version.id,
          params.data.id,
          newIngredients,
          newDirections,
        );
      } catch (err) {
        req.log.warn({ err }, `Failed to score new version ${version.id}`);
      }
    });
  },
);

router.get("/recipes/:id/versions", async (req, res): Promise<void> => {
  const params = ListRecipeVersionsParams.safeParse(req.params);
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

  const versions = await db
    .select({
      id: recipeVersionsTable.id,
      recipeId: recipeVersionsTable.recipeId,
      label: recipeVersionsTable.label,
      isOriginal: recipeVersionsTable.isOriginal,
      createdAt: recipeVersionsTable.createdAt,
    })
    .from(recipeVersionsTable)
    .where(
      and(
        eq(recipeVersionsTable.recipeId, params.data.id),
        isNull(recipeVersionsTable.deletedAt),
      ),
    )
    .orderBy(recipeVersionsTable.createdAt);

  const versionIds = versions.map((v) => v.id);
  const allScores =
    versionIds.length > 0
      ? await db
          .select({
            versionId: recipeComplianceScoresTable.versionId,
            profileId: recipeComplianceScoresTable.profileId,
            profileName: dietaryProfilesTable.name,
            score: recipeComplianceScoresTable.score,
          })
          .from(recipeComplianceScoresTable)
          .innerJoin(
            dietaryProfilesTable,
            eq(recipeComplianceScoresTable.profileId, dietaryProfilesTable.id),
          )
          .where(inArray(recipeComplianceScoresTable.versionId, versionIds))
      : [];

  const versionsWithScores = versions.map((v) => ({
    ...v,
    scores: allScores
      .filter((s) => s.versionId === v.id)
      .map((s) => ({
        profileId: s.profileId,
        profileName: s.profileName,
        score: s.score,
      })),
  }));

  res.json(versionsWithScores);
});

router.get(
  "/recipes/:id/versions/:versionId",
  async (req, res): Promise<void> => {
    const params = GetRecipeVersionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [version] = await db
      .select()
      .from(recipeVersionsTable)
      .where(
        and(
          eq(recipeVersionsTable.id, params.data.versionId),
          eq(recipeVersionsTable.recipeId, params.data.id),
        ),
      );

    if (!version) {
      res.status(404).json({ error: "Version not found" });
      return;
    }

    res.json(version);
  },
);

router.delete(
  "/recipes/:id/versions/:versionId",
  async (req, res): Promise<void> => {
    const params = GetRecipeVersionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [version] = await db
      .select()
      .from(recipeVersionsTable)
      .where(
        and(
          eq(recipeVersionsTable.id, params.data.versionId),
          eq(recipeVersionsTable.recipeId, params.data.id),
          isNull(recipeVersionsTable.deletedAt),
        ),
      );

    if (!version) {
      res.status(404).json({ error: "Version not found" });
      return;
    }

    if (version.isOriginal) {
      res.status(400).json({ error: "Cannot delete the original version." });
      return;
    }

    await db
      .update(recipeVersionsTable)
      .set({ deletedAt: new Date() })
      .where(eq(recipeVersionsTable.id, params.data.versionId));

    res.sendStatus(204);
  },
);

router.post(
  "/recipes/:id/versions/:versionId/restore",
  async (req, res): Promise<void> => {
    const params = GetRecipeVersionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [version] = await db
      .update(recipeVersionsTable)
      .set({ deletedAt: null })
      .where(
        and(
          eq(recipeVersionsTable.id, params.data.versionId),
          eq(recipeVersionsTable.recipeId, params.data.id),
        ),
      )
      .returning();

    if (!version) {
      res.status(404).json({ error: "Version not found" });
      return;
    }

    res.sendStatus(204);
  },
);

async function scoreVersionForAllProfiles(
  versionId: number,
  recipeId: number,
  ingredients: string,
  directions: string,
): Promise<void> {
  const profiles = await db.select().from(dietaryProfilesTable);
  for (const profile of profiles) {
    try {
      const result = await computeComplianceScoreForRecipeAndProfile(
        ingredients,
        directions,
        profile.description,
      );
      await db.insert(recipeComplianceScoresTable).values({
        recipeId,
        profileId: profile.id,
        versionId,
        score: result.score,
        reason: result.reason,
        prosList: result.pros,
        consList: result.cons,
      });
    } catch {
      // Silently skip failed individual scores
    }
  }
}

export async function scoreRecipeForAllProfiles(
  recipeId: number,
  ingredients: string,
  directions: string,
): Promise<void> {
  const profiles = await db.select().from(dietaryProfilesTable);
  for (const profile of profiles) {
    try {
      const result = await computeComplianceScoreForRecipeAndProfile(
        ingredients,
        directions,
        profile.description,
      );
      await db
        .delete(recipeComplianceScoresTable)
        .where(
          and(
            eq(recipeComplianceScoresTable.recipeId, recipeId),
            eq(recipeComplianceScoresTable.profileId, profile.id),
            isNull(recipeComplianceScoresTable.versionId),
          ),
        );
      await db.insert(recipeComplianceScoresTable).values({
        recipeId,
        profileId: profile.id,
        score: result.score,
        reason: result.reason,
        prosList: result.pros,
        consList: result.cons,
      });
    } catch {
      // Silently skip failed individual scores
    }
  }
}

export async function seedOriginalVersionsForExistingRecipes(): Promise<void> {
  const recipes = await db.select().from(recipesTable);
  for (const recipe of recipes) {
    const existing = await db
      .select()
      .from(recipeVersionsTable)
      .where(
        and(
          eq(recipeVersionsTable.recipeId, recipe.id),
          eq(recipeVersionsTable.isOriginal, true),
        ),
      );
    if (existing.length === 0) {
      await db.insert(recipeVersionsTable).values({
        recipeId: recipe.id,
        label: "Original",
        ingredients: recipe.ingredients,
        directions: recipe.directions,
        isOriginal: true,
      });
    }
  }
}

export default router;
