import { Storage, type StorageOptions } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import { Readable } from "stream";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storageOptions: StorageOptions = {
  credentials: {
    type: "external_account",
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
};

let _gcsClient: Storage | null = null;

function getGcsClient(): Storage {
  if (!_gcsClient) {
    _gcsClient = new Storage(storageOptions);
  }
  return _gcsClient;
}

function getBucketAndPrefix(): { bucketName: string; prefix: string } {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR ?? "";
  if (!privateObjectDir) {
    throw new Error("PRIVATE_OBJECT_DIR not set — object storage not configured");
  }
  const parts = privateObjectDir.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const prefix = parts.slice(1).join("/");
  return { bucketName, prefix };
}

function detectContentType(url: string, contentTypeHeader?: string | null): string {
  if (contentTypeHeader && contentTypeHeader.startsWith("image/")) {
    return contentTypeHeader.split(";")[0].trim();
  }
  try {
    const ext = new URL(url).pathname.split(".").pop()?.toLowerCase();
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "gif") return "image/gif";
    if (ext === "webp") return "image/webp";
  } catch {
    // ignore
  }
  return "image/jpeg";
}

function contentTypeToExt(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

/**
 * Builds the public API URL for a stored recipe image filename.
 * Uses REPLIT_DEV_DOMAIN when available so the URL is externally accessible.
 */
export function buildImageServingUrl(filename: string): string {
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  const baseUrl = replitDomain
    ? `https://${replitDomain}`
    : `http://localhost:${process.env.PORT ?? 3000}`;
  return `${baseUrl}/api/recipes/image/${filename}`;
}

/**
 * Downloads an image from `sourceUrl`, uploads it to object storage,
 * and returns the full public API URL for serving it (e.g. https://<domain>/api/recipes/image/<uuid>.jpg).
 * Returns null if the download or upload fails — callers should fall back
 * to saving the recipe without an image.
 */
export async function downloadAndStoreImage(
  sourceUrl: string
): Promise<string | null> {
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.warn(
        `[image-storage] Download failed for "${sourceUrl}": HTTP ${res.status}`
      );
      return null;
    }

    const contentType = detectContentType(sourceUrl, res.headers.get("content-type"));
    const ext = contentTypeToExt(contentType);
    const buf = Buffer.from(await res.arrayBuffer());

    if (buf.length === 0) {
      console.warn(`[image-storage] Empty image body for "${sourceUrl}"`);
      return null;
    }

    const { bucketName, prefix } = getBucketAndPrefix();
    const objectId = randomUUID();
    const filename = `${objectId}.${ext}`;
    const objectName = prefix
      ? `${prefix}/recipe-images/${filename}`
      : `recipe-images/${filename}`;

    const gcs = getGcsClient();
    const bucket = gcs.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(buf, {
      metadata: { contentType },
      resumable: false,
    });

    const servingUrl = buildImageServingUrl(filename);
    console.log(
      `[image-storage] Stored image from "${sourceUrl}" → ${servingUrl} (${buf.length} bytes)`
    );
    return servingUrl;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[image-storage] Failed to store image from "${sourceUrl}": ${message}`
    );
    return null;
  }
}

/**
 * Streams a stored recipe image from object storage.
 * Returns null if the object is not found or storage is unavailable.
 */
export async function getStoredImage(filename: string): Promise<{
  stream: Readable;
  contentType: string;
  contentLength?: number;
} | null> {
  try {
    const { bucketName, prefix } = getBucketAndPrefix();
    const objectName = prefix
      ? `${prefix}/recipe-images/${filename}`
      : `recipe-images/${filename}`;

    const gcs = getGcsClient();
    const bucket = gcs.bucket(bucketName);
    const file = bucket.file(objectName);

    const [exists] = await file.exists();
    if (!exists) {
      return null;
    }

    const [metadata] = await file.getMetadata();
    const contentType = (metadata.contentType as string | undefined) ?? "image/jpeg";
    const rawSize = metadata.size;
    const contentLength =
      rawSize !== undefined && rawSize !== null ? Number(rawSize) : undefined;

    const stream = file.createReadStream();
    return { stream, contentType, contentLength };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[image-storage] Failed to retrieve image "${filename}": ${message}`
    );
    return null;
  }
}

/**
 * Extracts the filename portion from a stored recipe image serving URL.
 * Returns null if the URL is not a stored image URL.
 * Stored image URLs look like: https://<domain>/api/recipes/image/<filename>
 */
export function extractStoredImageFilename(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const match = imageUrl.match(/\/api\/recipes\/image\/([^/?#]+)$/);
  return match ? match[1] : null;
}
