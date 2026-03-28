import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deterministicRecipeUid, syncRecipeToPaprika } from "./paprika";
import { createHash } from "crypto";

describe("deterministicRecipeUid", () => {
  it("returns the same UID for the same dbId", () => {
    const uid1 = deterministicRecipeUid(42);
    const uid2 = deterministicRecipeUid(42);
    expect(uid1).toBe(uid2);
  });

  it("returns different UIDs for different dbIds", () => {
    expect(deterministicRecipeUid(1)).not.toBe(deterministicRecipeUid(2));
  });

  it("returns a UUID-shaped string (8-4-4-4-12 hex segments)", () => {
    const uid = deterministicRecipeUid(1);
    expect(uid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("is deterministic across calls (matches manual SHA-256 derivation)", () => {
    const dbId = 99;
    const hash = createHash("sha256")
      .update(`recipe-agent:${dbId}`)
      .digest("hex");
    const expected = [
      hash.slice(0, 8),
      hash.slice(8, 12),
      hash.slice(12, 16),
      hash.slice(16, 20),
      hash.slice(20, 32),
    ].join("-");
    expect(deterministicRecipeUid(dbId)).toBe(expected);
  });
});

async function decodePaprikaPayload(fetchCalls: Array<{ url: string; init?: RequestInit }>) {
  const paprikaCall = fetchCalls.find((c) =>
    c.url.includes("paprikaapp.com/api/v1/sync/recipe")
  );
  expect(paprikaCall).toBeDefined();

  const bodyBuffer = paprikaCall!.init!.body as Buffer;
  const bodyStr = bodyBuffer.toString("binary");
  const gzipStart = bodyStr.indexOf("\r\n\r\n") + 4;
  const gzipEnd = bodyStr.lastIndexOf("\r\n--");
  const gzipBuf = Buffer.from(bodyStr.slice(gzipStart, gzipEnd), "binary");

  const zlib = await import("zlib");
  const unzipped: Buffer = await new Promise((resolve, reject) =>
    zlib.gunzip(gzipBuf, (err, result) =>
      err ? reject(err) : resolve(result)
    )
  );
  return JSON.parse(unzipped.toString("utf-8"));
}

describe("syncRecipeToPaprika — image upload", () => {
  let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

  const FAKE_IMAGE_BYTES = Buffer.from("fake-image-bytes");
  const PHOTO_BASE64 = FAKE_IMAGE_BYTES.toString("base64");
  const PHOTO_HASH = createHash("sha256").update(FAKE_IMAGE_BYTES).digest("hex");

  function makeRecipe(overrides: Partial<Parameters<typeof syncRecipeToPaprika>[2]> = {}) {
    return {
      dbId: 1,
      name: "Test Recipe",
      ingredients: "1 cup flour",
      directions: "Mix and bake",
      ...overrides,
    };
  }

  beforeEach(() => {
    fetchCalls = [];

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        fetchCalls.push({ url, init });

        if (url === "https://example.com/image.jpg") {
          const ab = FAKE_IMAGE_BYTES.buffer.slice(
            FAKE_IMAGE_BYTES.byteOffset,
            FAKE_IMAGE_BYTES.byteOffset + FAKE_IMAGE_BYTES.byteLength
          ) as ArrayBuffer;
          return Promise.resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(ab),
          } as unknown as Response);
        }

        if (url === "https://unreachable.example.com/image.jpg") {
          return Promise.reject(new Error("ECONNREFUSED"));
        }

        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(""),
        } as unknown as Response);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("includes photo, photo_hash, and photo_filename in the Paprika payload when image fetch succeeds", async () => {
    const result = await syncRecipeToPaprika("user@example.com", "pass", {
      ...makeRecipe({ imageUrl: "https://example.com/image.jpg" }),
    });

    expect(result.success).toBe(true);

    const payload = await decodePaprikaPayload(fetchCalls);

    expect(payload.photo).toBe(PHOTO_BASE64);
    expect(payload.photo_hash).toBe(PHOTO_HASH);
    expect(payload.photo_filename).toBe("photo.jpg");
  });

  it("completes without crashing when image URL is unreachable, logs a warning, and sends null photo fields", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await syncRecipeToPaprika("user@example.com", "pass", {
      ...makeRecipe({ imageUrl: "https://unreachable.example.com/image.jpg" }),
    });

    expect(result.success).toBe(true);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\[paprika\].*image.*unreachable\.example\.com/i)
    );

    const payload = await decodePaprikaPayload(fetchCalls);

    expect(payload.photo).toBeNull();
    expect(payload.photo_hash).toBeNull();
    expect(payload.photo_filename).toBeNull();
  });

  it("uses the same deterministic UID on every call for the same recipe (no duplicates)", async () => {
    const recipe = makeRecipe();
    const expectedUid = deterministicRecipeUid(recipe.dbId);

    const result1 = await syncRecipeToPaprika("user@example.com", "pass", recipe);
    const result2 = await syncRecipeToPaprika("user@example.com", "pass", recipe);

    expect(result1.uid).toBe(expectedUid);
    expect(result2.uid).toBe(expectedUid);
    expect(result1.uid).toBe(result2.uid);

    const paprikaCalls = fetchCalls.filter((c) =>
      c.url.includes("paprikaapp.com/api/v1/sync/recipe")
    );
    expect(paprikaCalls).toHaveLength(2);
    expect(paprikaCalls[0].url).toBe(paprikaCalls[1].url);
    expect(paprikaCalls[0].url).toBe(
      `https://www.paprikaapp.com/api/v1/sync/recipe/${expectedUid}/`
    );
  });
});
