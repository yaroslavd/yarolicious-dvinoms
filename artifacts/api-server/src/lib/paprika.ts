import { createHash } from "crypto";
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

/**
 * Derives a stable UUID from a recipe's DB primary key.
 * SHA-256("recipe-agent:{dbId}") → formatted as UUID.
 * This ensures the same recipe always maps to the same Paprika entry,
 * preventing duplicates even if the stored UID is lost.
 */
export function deterministicRecipeUid(dbId: number): string {
  const hash = createHash("sha256").update(`recipe-agent:${dbId}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join("-");
}

async function fetchImageAsBase64(
  url: string
): Promise<{ data: string; hash: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`[paprika] Image fetch failed for URL "${url}": HTTP ${res.status}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const data = buf.toString("base64");
    const hash = createHash("sha256").update(buf).digest("hex");
    return { data, hash };
  } catch (err: any) {
    console.warn(`[paprika] Image fetch error for URL "${url}": ${err?.message ?? err}`);
    return null;
  }
}

function derivePhotoFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop()?.toLowerCase();
    if (ext && ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) {
      return `photo.${ext}`;
    }
  } catch {
    // ignore
  }
  return "photo.jpg";
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

export interface PaprikaCategoryRaw {
  uid: string;
  name: string;
  order_flag: number;
  parent_uid: string | null;
}

export async function fetchPaprikaCategories(
  email: string,
  password: string
): Promise<PaprikaCategoryRaw[]> {
  const authHeader = makeAuthHeader(email, password);
  const res = await fetch(`${PAPRIKA_BASE_V1}/sync/categories/`, {
    headers: {
      Authorization: authHeader,
      "User-Agent": "Paprika/3.0",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch Paprika categories: ${res.status} ${text}`);
  }
  const json = await res.json() as { result: PaprikaCategoryRaw[] };
  return json.result ?? [];
}

export async function syncRecipeToPaprika(
  email: string,
  password: string,
  recipe: {
    dbId: number;
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
    categoryUids?: string[];
  }
): Promise<{ success: boolean; uid: string; message: string }> {
  const uid = deterministicRecipeUid(recipe.dbId);
  const created = nowTimestamp();

  // Download and embed image if available
  let photo: string | null = null;
  let photoHash: string | null = null;
  let photoFilename: string | null = null;
  if (recipe.imageUrl) {
    const img = await fetchImageAsBase64(recipe.imageUrl);
    if (img) {
      photo = img.data;
      photoHash = img.hash;
      photoFilename = derivePhotoFilename(recipe.imageUrl);
    } else {
      console.warn(`[paprika] Skipping image for recipe "${recipe.name}" (id=${recipe.dbId}): image could not be fetched from ${recipe.imageUrl}`);
    }
  }

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
    categories: recipe.categoryUids ?? [],
    difficulty: recipe.difficulty ?? "",
    rating: 0,
    on_favorites: 0,
    photo,
    photo_hash: photoHash,
    photo_filename: photoFilename,
    photo_large: null,
    scale: null,
    deleted: false,
    created,
    hash: "",
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

/**
 * Marks a recipe as deleted in Paprika by posting a minimal gzipped payload
 * with deleted: true. Used to clean up stale/duplicate entries.
 * Throws on non-2xx responses (404 is treated as success — already deleted).
 */
export async function deleteFromPaprika(
  email: string,
  password: string,
  uid: string
): Promise<void> {
  const payload = {
    uid,
    name: "",
    deleted: true,
    hash: createHash("sha256").update(uid).digest("hex"),
  };
  const jsonBuf = Buffer.from(JSON.stringify(payload), "utf-8");
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
  // 404 = already deleted — treat as success (idempotent)
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Paprika delete failed for uid ${uid}: HTTP ${response.status} — ${text}`);
  }
}
