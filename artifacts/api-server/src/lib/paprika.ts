import { randomUUID } from "crypto";
import zlib from "zlib";

const PAPRIKA_BASE = "https://www.paprikaapp.com/api/v2";

const PAPRIKA_HEADERS = {
  "User-Agent": "Paprika/3.0 iOS/18.0",
  Accept: "application/json",
};

function makeAuthHeader(email: string, password: string): string {
  return "Basic " + Buffer.from(`${email}:${password}`).toString("base64");
}

function gzipAsync(data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gzip(data, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export async function validatePaprikaCredentials(
  email: string,
  password: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const response = await fetch(`${PAPRIKA_BASE}/sync/status/`, {
      headers: {
        ...PAPRIKA_HEADERS,
        Authorization: makeAuthHeader(email, password),
      },
    });
    if (response.ok) return { valid: true };
    const text = await response.text();
    return { valid: false, error: `${response.status}: ${text}` };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

export async function syncRecipeToPaprika(
  email: string,
  password: string,
  recipe: {
    name: string;
    description?: string | null;
    ingredients: string;
    directions: string;
    servings?: string | null;
    totalTime?: string | null;
    prepTime?: string | null;
    cookTime?: string | null;
    notes?: string | null;
    nutritionalInfo?: string | null;
    source?: string | null;
    sourceUrl?: string | null;
    imageUrl?: string | null;
    categories?: string | null;
    difficulty?: string | null;
  }
): Promise<{ success: boolean; uid: string; message: string }> {
  const uid = randomUUID();

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
    categories: recipe.categories ? recipe.categories.split(",").map((c) => c.trim()) : [],
    difficulty: recipe.difficulty ?? "",
    rating: 0,
    on_favorites: false,
    in_trash: false,
    hash: uid,
    photo: "",
    photo_hash: null as string | null,
    photo_large: null as string | null,
    scale: null as string | null,
  };

  const jsonBuf = Buffer.from(JSON.stringify(paprikaRecipe), "utf-8");
  const gzipped = await gzipAsync(jsonBuf);
  const base64Data = gzipped.toString("base64");

  const body = new URLSearchParams({ recipe64: base64Data }).toString();

  const response = await fetch(`${PAPRIKA_BASE}/sync/recipe/${uid}/`, {
    method: "POST",
    headers: {
      ...PAPRIKA_HEADERS,
      Authorization: makeAuthHeader(email, password),
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(body, "utf-8")),
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      success: false,
      uid: "",
      message: `Paprika API error ${response.status}: ${text}`,
    };
  }

  return {
    success: true,
    uid,
    message: "Recipe successfully exported to Paprika",
  };
}
