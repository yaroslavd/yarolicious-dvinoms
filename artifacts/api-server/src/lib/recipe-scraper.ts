import { openai } from "@workspace/integrations-openai-ai-server";

export interface ScrapedRecipe {
  name: string;
  description: string | null;
  ingredients: string;
  directions: string;
  servings: string | null;
  totalTime: string | null;
  prepTime: string | null;
  cookTime: string | null;
  notes: string | null;
  nutritionalInfo: string | null;
  source: string | null;
  sourceUrl: string;
  imageUrl: string | null;
  categories: string | null;
  difficulty: string | null;
}

export async function scrapeRecipeFromUrl(url: string): Promise<ScrapedRecipe> {
  const fetchResponse = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (!fetchResponse.ok) {
    throw new Error(
      `Failed to fetch URL: ${fetchResponse.status} ${fetchResponse.statusText}`,
    );
  }

  const html = await fetchResponse.text();

  const truncatedHtml = html.slice(0, 50000);

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `You are a recipe extraction assistant. Extract recipe information from HTML content and return a JSON object.
        
Return a JSON object with these exact fields:
- name: string (recipe title)
- description: string or null
- ingredients: string (each ingredient on its own line)
- directions: string (each step numbered, one per line)
- servings: string or null (e.g. "4 servings")
- totalTime: string or null (e.g. "1 hour 30 minutes")
- prepTime: string or null
- cookTime: string or null
- notes: string or null
- nutritionalInfo: string or null
- source: string or null (publication/website name)
- imageUrl: string or null (absolute URL to the main recipe image)
- categories: string or null (comma-separated tags/categories)
- difficulty: string or null (easy/medium/hard)

Return ONLY the JSON object, no markdown.`,
      },
      {
        role: "user",
        content: `Extract the recipe from this HTML page (URL: ${url}):\n\n${truncatedHtml}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";

  let parsed: Partial<ScrapedRecipe>;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  return {
    name: parsed.name ?? "Untitled Recipe",
    description: parsed.description ?? null,
    ingredients: parsed.ingredients ?? "",
    directions: parsed.directions ?? "",
    servings: parsed.servings ?? null,
    totalTime: parsed.totalTime ?? null,
    prepTime: parsed.prepTime ?? null,
    cookTime: parsed.cookTime ?? null,
    notes: parsed.notes ?? null,
    nutritionalInfo: parsed.nutritionalInfo ?? null,
    source: parsed.source ?? new URL(url).hostname,
    sourceUrl: url,
    imageUrl: parsed.imageUrl ?? null,
    categories: parsed.categories ?? null,
    difficulty: parsed.difficulty ?? null,
  };
}

export async function generateRecipeWithAI(
  description: string,
  preferences?: string | null,
): Promise<ScrapedRecipe> {
  const prompt = preferences
    ? `${description}\n\nDietary preferences/restrictions: ${preferences}`
    : description;

  const completion = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `You are a professional chef and recipe developer. Create a detailed, delicious recipe based on the user's description.

Return a JSON object with these exact fields:
- name: string (creative recipe title)
- description: string (appetizing 1-2 sentence description)
- ingredients: string (each ingredient on its own line with precise measurements, e.g. "2 cups all-purpose flour")
- directions: string (numbered steps, one per line, detailed and clear)
- servings: string (e.g. "4 servings")
- totalTime: string (e.g. "45 minutes")
- prepTime: string (e.g. "15 minutes")
- cookTime: string (e.g. "30 minutes")
- notes: string or null (chef's tips, substitutions, storage instructions)
- nutritionalInfo: string or null (approximate per serving if you can estimate)
- categories: string (comma-separated relevant tags, e.g. "Italian, Pasta, Dinner")
- difficulty: string (Easy, Medium, or Hard)

Return ONLY the JSON object, no markdown.`,
      },
      {
        role: "user",
        content: `Create a recipe for: ${prompt}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? "{}";

  let parsed: Partial<ScrapedRecipe>;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  return {
    name: parsed.name ?? "AI Generated Recipe",
    description: parsed.description ?? null,
    ingredients: parsed.ingredients ?? "",
    directions: parsed.directions ?? "",
    servings: parsed.servings ?? null,
    totalTime: parsed.totalTime ?? null,
    prepTime: parsed.prepTime ?? null,
    cookTime: parsed.cookTime ?? null,
    notes: parsed.notes ?? null,
    nutritionalInfo: parsed.nutritionalInfo ?? null,
    source: "AI Generated",
    sourceUrl: null as any,
    imageUrl: null,
    categories: parsed.categories ?? null,
    difficulty: parsed.difficulty ?? null,
  };
}
