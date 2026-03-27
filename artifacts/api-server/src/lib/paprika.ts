import { createGzip } from "zlib";
import { promisify } from "util";
import { randomUUID } from "crypto";

const gzip = promisify(createGzip);

export interface PaprikaRecipe {
  uid: string;
  name: string;
  description: string;
  ingredients: string;
  directions: string;
  servings: string;
  total_time: string;
  prep_time: string;
  cook_time: string;
  notes: string;
  nutritional_info: string;
  source: string;
  source_url: string;
  image_url: string;
  categories: string[];
  difficulty: string;
  rating: number;
  on_favorites: boolean;
  in_trash: boolean;
  hash: string;
  photo: string;
  photo_hash: string | null;
  photo_large: string | null;
  scale: string | null;
  categories_str: string;
  cook_time_text: string;
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

  const paprikaRecipe: PaprikaRecipe = {
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
    photo_hash: null,
    photo_large: null,
    scale: null,
    categories_str: recipe.categories ?? "",
    cook_time_text: recipe.cookTime ?? "",
  };

  const jsonStr = JSON.stringify(paprikaRecipe);

  const gzipBuffer = await new Promise<Buffer>((resolve, reject) => {
    const zlib = require("zlib");
    zlib.gzip(Buffer.from(jsonStr, "utf-8"), (err: Error | null, result: Buffer) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  const base64Data = gzipBuffer.toString("base64");

  const formData = new URLSearchParams();
  formData.append("recipe64", base64Data);

  const authHeader = "Basic " + Buffer.from(`${email}:${password}`).toString("base64");

  const response = await fetch("https://www.paprikaapp.com/api/v1/sync/recipe/", {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
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

export async function validatePaprikaCredentials(
  email: string,
  password: string
): Promise<boolean> {
  const authHeader = "Basic " + Buffer.from(`${email}:${password}`).toString("base64");
  try {
    const response = await fetch("https://www.paprikaapp.com/api/v1/sync/recipes/", {
      headers: { Authorization: authHeader },
    });
    return response.ok;
  } catch {
    return false;
  }
}
