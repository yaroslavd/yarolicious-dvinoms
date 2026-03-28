import { randomUUID, createHash } from "crypto";
import zlib from "zlib";

const PAPRIKA_BASE_V1 = "https://www.paprikaapp.com/api/v1";
const PAPRIKA_BASE_V2 = "https://www.paprikaapp.com/api/v2";

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

function nowTimestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function makeMultipartBody(
  gzipped: Buffer,
  boundary: string
): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="data"; filename="recipe.gz"\r\nContent-Type: application/octet-stream\r\n\r\n`
    ),
    gzipped,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

export async function validatePaprikaCredentials(
  email: string,
  password: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const authHeader = makeAuthHeader(email, password);
    // v2 status is a lightweight check
    const r2 = await fetch(`${PAPRIKA_BASE_V2}/sync/status/`, {
      headers: { Authorization: authHeader, "User-Agent": "Paprika/3.0", Accept: "application/json" },
    });
    if (r2.ok) return { valid: true };

    // Fall back to v1 recipes list
    const r1 = await fetch(`${PAPRIKA_BASE_V1}/sync/recipes/`, {
      headers: { Authorization: authHeader, "User-Agent": "Paprika/3.0", Accept: "application/json" },
    });
    if (r1.ok) return { valid: true };

    const text = await r2.text();
    return { valid: false, error: `${r2.status}: ${text}` };
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
  const created = nowTimestamp();

  const paprikaRecipe = {
    uid,
    name: recipe.name,
    directions: recipe.directions,
    ingredients: recipe.ingredients,
    servings: recipe.servings ?? "",
    total_time: recipe.totalTime ?? "",
    prep_time: recipe.prepTime ?? "",
    cook_time: recipe.cookTime ?? "",
    notes: recipe.notes ?? "",
    nutritional_info: recipe.nutritionalInfo ?? "",
    source: recipe.source ?? "",
    source_url: recipe.sourceUrl ?? "",
    image_url: recipe.imageUrl ?? null,
    categories: [] as string[], // category UIDs — we don't have them, so leave empty
    difficulty: recipe.difficulty ?? "",
    rating: 0,
    on_favorites: 0,   // must be integer per Paprika v1 API
    photo: null,
    photo_hash: null,
    photo_large: null,
    scale: null,
    deleted: false,
    created,
    hash: "",          // filled in below
  };

  // Hash = SHA-256 of the uid (consistent with reverse-engineered format)
  paprikaRecipe.hash = createHash("sha256").update(uid).digest("hex");

  const jsonBuf = Buffer.from(JSON.stringify(paprikaRecipe), "utf-8");
  const gzipped = await gzipAsync(jsonBuf);

  const authHeader = makeAuthHeader(email, password);
  const boundary = "----FormBoundary" + Date.now();
  const body = makeMultipartBody(gzipped, boundary);

  const response = await fetch(`${PAPRIKA_BASE_V1}/sync/recipe/${uid}/`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "User-Agent": "Paprika/3.0",
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401) {
      return {
        success: false,
        uid: "",
        message: "Authentication failed — please re-enter your Paprika credentials in Settings.",
      };
    }
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
