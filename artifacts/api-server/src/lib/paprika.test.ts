import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import zlib from "zlib";
import {
  deterministicRecipeUid,
  syncRecipeToPaprika,
  mapPaprikaRecipeToLocal,
  fetchPaprikaRecipeList,
  fetchPaprikaRecipeDetail,
  type PaprikaCategoryRaw,
  type PaprikaRecipeRaw,
} from "./paprika";

// ─── deterministicRecipeUid ───────────────────────────────────────────────────

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

// ─── syncRecipeToPaprika — image upload ──────────────────────────────────────

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

// ─── mapPaprikaRecipeToLocal ──────────────────────────────────────────────────

const mockCategories: PaprikaCategoryRaw[] = [
  { uid: "cat-1", name: "Dinner", order_flag: 1, parent_uid: null },
  { uid: "cat-2", name: "Soups", order_flag: 2, parent_uid: null },
  { uid: "cat-3", name: "Vegetarian", order_flag: 3, parent_uid: null },
];

describe("mapPaprikaRecipeToLocal", () => {
  it("maps basic recipe fields correctly", () => {
    const raw: PaprikaRecipeRaw = {
      uid: "uid-abc-123",
      name: "Chicken Soup",
      description: "A hearty soup",
      ingredients: "1 chicken\n2 carrots",
      directions: "Boil chicken. Add carrots.",
      servings: "4",
      total_time: "1 hour",
      prep_time: "15 minutes",
      cook_time: "45 minutes",
      notes: "Great for winter",
      nutritional_info: "200 calories",
      source: "Grandma",
      source_url: "https://example.com/soup",
      image_url: "https://example.com/soup.jpg",
      categories: [],
      difficulty: "Easy",
      rating: 4,
    };

    const result = mapPaprikaRecipeToLocal(raw, mockCategories);

    expect(result.paprikaUid).toBe("uid-abc-123");
    expect(result.name).toBe("Chicken Soup");
    expect(result.description).toBe("A hearty soup");
    expect(result.ingredients).toBe("1 chicken\n2 carrots");
    expect(result.directions).toBe("Boil chicken. Add carrots.");
    expect(result.servings).toBe("4");
    expect(result.totalTime).toBe("1 hour");
    expect(result.prepTime).toBe("15 minutes");
    expect(result.cookTime).toBe("45 minutes");
    expect(result.notes).toBe("Great for winter");
    expect(result.nutritionalInfo).toBe("200 calories");
    expect(result.source).toBe("Grandma");
    expect(result.sourceUrl).toBe("https://example.com/soup");
    expect(result.difficulty).toBe("Easy");
    expect(result.rating).toBe(4);
  });

  it("resolves category UIDs to names", () => {
    const raw: PaprikaRecipeRaw = {
      uid: "uid-abc",
      name: "Vegetable Soup",
      ingredients: "veggies",
      directions: "Cook",
      categories: ["cat-1", "cat-2"],
    };

    const result = mapPaprikaRecipeToLocal(raw, mockCategories);
    expect(result.categories).toBe("Dinner, Soups");
  });

  it("handles unknown category UIDs by using the UID as fallback", () => {
    const raw: PaprikaRecipeRaw = {
      uid: "uid-xyz",
      name: "Mystery Dish",
      ingredients: "???",
      directions: "Cook",
      categories: ["cat-1", "unknown-uid"],
    };

    const result = mapPaprikaRecipeToLocal(raw, mockCategories);
    expect(result.categories).toBe("Dinner, unknown-uid");
  });

  it("returns null categories when categories array is empty", () => {
    const raw: PaprikaRecipeRaw = {
      uid: "uid-no-cats",
      name: "Plain Recipe",
      ingredients: "flour",
      directions: "Bake",
      categories: [],
    };

    const result = mapPaprikaRecipeToLocal(raw, mockCategories);
    expect(result.categories).toBeNull();
  });

  it("returns null categories when categories is undefined", () => {
    const raw: PaprikaRecipeRaw = {
      uid: "uid-no-cats-2",
      name: "Another Recipe",
      ingredients: "eggs",
      directions: "Scramble",
    };

    const result = mapPaprikaRecipeToLocal(raw, []);
    expect(result.categories).toBeNull();
  });

  it("prefers embedded base64 photo over image_url", () => {
    const raw: PaprikaRecipeRaw = {
      uid: "uid-photo",
      name: "Photo Recipe",
      ingredients: "cheese",
      directions: "Melt",
      photo: "abc123base64==",
      photo_filename: "photo.jpg",
      image_url: "https://example.com/external.jpg",
    };

    const result = mapPaprikaRecipeToLocal(raw, []);
    expect(result.imageUrl).toBe("data:image/jpeg;base64,abc123base64==");
  });

  it("falls back to image_url when no photo is present", () => {
    const raw: PaprikaRecipeRaw = {
      uid: "uid-url-only",
      name: "URL Image Recipe",
      ingredients: "tomatoes",
      directions: "Slice",
      image_url: "https://example.com/tomato.jpg",
    };

    const result = mapPaprikaRecipeToLocal(raw, []);
    expect(result.imageUrl).toBe("https://example.com/tomato.jpg");
  });

  it("uses correct mime type for png photos", () => {
    const raw: PaprikaRecipeRaw = {
      uid: "uid-png",
      name: "PNG Recipe",
      ingredients: "beans",
      directions: "Boil",
      photo: "pngbase64==",
      photo_filename: "photo.png",
    };

    const result = mapPaprikaRecipeToLocal(raw, []);
    expect(result.imageUrl).toBe("data:image/png;base64,pngbase64==");
  });

  it("returns null imageUrl when no photo or image_url", () => {
    const raw: PaprikaRecipeRaw = {
      uid: "uid-no-image",
      name: "No Image Recipe",
      ingredients: "water",
      directions: "Drink",
    };

    const result = mapPaprikaRecipeToLocal(raw, []);
    expect(result.imageUrl).toBeNull();
  });

  it("trims whitespace from optional string fields", () => {
    const raw: PaprikaRecipeRaw = {
      uid: "uid-whitespace",
      name: "Trimmed Recipe",
      ingredients: "salt",
      directions: "Season",
      source: "  My Blog  ",
      notes: "  Great dish!  ",
      difficulty: "  Medium  ",
    };

    const result = mapPaprikaRecipeToLocal(raw, []);
    expect(result.source).toBe("My Blog");
    expect(result.notes).toBe("Great dish!");
    expect(result.difficulty).toBe("Medium");
  });

  it("defaults rating to 0 when undefined", () => {
    const raw: PaprikaRecipeRaw = {
      uid: "uid-no-rating",
      name: "Unrated Recipe",
      ingredients: "sugar",
      directions: "Sprinkle",
    };

    const result = mapPaprikaRecipeToLocal(raw, []);
    expect(result.rating).toBe(0);
  });
});

// ─── fetchPaprikaRecipeList ───────────────────────────────────────────────────

describe("fetchPaprikaRecipeList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns list of recipe items on success", async () => {
    const mockItems = [
      { uid: "uid-1", hash: "hash-1" },
      { uid: "uid-2", hash: "hash-2" },
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: mockItems }),
    }));

    const result = await fetchPaprikaRecipeList("test@example.com", "password");
    expect(result).toEqual(mockItems);
  });

  it("sends correct Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPaprikaRecipeList("user@test.com", "pass123");

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/sync/recipes/");
    expect(options.headers.Authorization).toBe(
      "Basic " + Buffer.from("user@test.com:pass123").toString("base64")
    );
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }));

    await expect(fetchPaprikaRecipeList("bad@test.com", "wrong")).rejects.toThrow(
      "Failed to fetch Paprika recipe list: 401 Unauthorized"
    );
  });

  it("returns empty array when result is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: null }),
    }));

    const result = await fetchPaprikaRecipeList("test@example.com", "pass");
    expect(result).toEqual([]);
  });
});

// ─── fetchPaprikaRecipeDetail ─────────────────────────────────────────────────

describe("fetchPaprikaRecipeDetail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns parsed recipe detail on success (plain JSON response)", async () => {
    const mockRecipe: PaprikaRecipeRaw = {
      uid: "uid-abc",
      name: "Test Recipe",
      ingredients: "flour",
      directions: "Mix",
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ result: mockRecipe }),
    }));

    const result = await fetchPaprikaRecipeDetail("test@example.com", "pass", "uid-abc");
    expect(result).toEqual(mockRecipe);
  });

  it("returns null on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    }));

    const result = await fetchPaprikaRecipeDetail("test@example.com", "pass", "uid-missing");
    expect(result).toBeNull();
  });

  it("throws on non-404 errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }));

    await expect(fetchPaprikaRecipeDetail("test@example.com", "pass", "uid-err")).rejects.toThrow(
      "Failed to fetch Paprika recipe uid-err: 500 Internal Server Error"
    );
  });

  it("sends UID in the request URL", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ result: { uid: "uid-xyz", name: "X", ingredients: "y", directions: "z" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchPaprikaRecipeDetail("test@example.com", "pass", "uid-xyz");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/sync/recipe/uid-xyz/");
  });

  it("decompresses gzip-encoded responses when Content-Encoding: gzip", async () => {
    const mockRecipe: PaprikaRecipeRaw = {
      uid: "uid-gzip",
      name: "Gzipped Recipe",
      ingredients: "flour",
      directions: "Bake",
    };
    const gzippedBuf = await new Promise<Buffer>((resolve, reject) => {
      zlib.gzip(Buffer.from(JSON.stringify({ result: mockRecipe }), "utf-8"), (err, buf) => {
        if (err) reject(err);
        else resolve(buf);
      });
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: {
        get: (name: string) => {
          if (name === "Content-Encoding") return "gzip";
          return null;
        },
      },
      arrayBuffer: async () => gzippedBuf.buffer.slice(
        gzippedBuf.byteOffset,
        gzippedBuf.byteOffset + gzippedBuf.byteLength
      ),
    }));

    const result = await fetchPaprikaRecipeDetail("test@example.com", "pass", "uid-gzip");
    expect(result).toBeDefined();
    expect(result?.uid).toBe("uid-gzip");
    expect(result?.name).toBe("Gzipped Recipe");
  });

  it("decompresses gzip when Content-Type is application/octet-stream", async () => {
    const mockRecipe: PaprikaRecipeRaw = {
      uid: "uid-octet",
      name: "Octet Stream Recipe",
      ingredients: "water",
      directions: "Drink",
    };
    const gzippedBuf = await new Promise<Buffer>((resolve, reject) => {
      zlib.gzip(Buffer.from(JSON.stringify({ result: mockRecipe }), "utf-8"), (err, buf) => {
        if (err) reject(err);
        else resolve(buf);
      });
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: true,
      headers: {
        get: (name: string) => {
          if (name === "Content-Type") return "application/octet-stream";
          if (name === "Content-Encoding") return null;
          return null;
        },
      },
      arrayBuffer: async () => gzippedBuf.buffer.slice(
        gzippedBuf.byteOffset,
        gzippedBuf.byteOffset + gzippedBuf.byteLength
      ),
    }));

    const result = await fetchPaprikaRecipeDetail("test@example.com", "pass", "uid-octet");
    expect(result?.name).toBe("Octet Stream Recipe");
  });
});
