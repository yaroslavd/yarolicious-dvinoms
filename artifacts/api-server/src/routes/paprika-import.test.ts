import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Integration tests for POST /api/paprika/import
 *
 * These tests mock the database and Paprika API to verify the import
 * orchestration logic: fetching categories, recipe list, recipe details,
 * filtering duplicates by paprikaUid, inserting new records, and
 * returning the { found, imported, skipped } summary.
 */

const mockCreds = {
  id: 1,
  email: "test@example.com",
  encryptedPassword: Buffer.from("password123").toString("base64"),
  updatedAt: new Date(),
};

const mockCategories = [
  { uid: "cat-1", name: "Dinner", order_flag: 1, parent_uid: null },
  { uid: "cat-2", name: "Soups", order_flag: 2, parent_uid: null },
];

const mockRecipeList = [
  { uid: "paprika-uid-1", hash: "hash-1" },
  { uid: "paprika-uid-2", hash: "hash-2" },
  { uid: "paprika-uid-3", hash: "hash-3" },
];

const makeRawRecipe = (uid: string, name: string, deleted = false) => ({
  uid,
  name,
  description: `Description for ${name}`,
  ingredients: "1 cup flour",
  directions: "Mix and bake",
  servings: "4",
  total_time: "1 hour",
  prep_time: "15 minutes",
  cook_time: "45 minutes",
  notes: "",
  nutritional_info: "",
  source: "Test Source",
  source_url: "",
  image_url: "",
  categories: ["cat-1"],
  difficulty: "Easy",
  rating: 3,
  photo: null,
  photo_filename: null,
  deleted,
});

vi.mock("@workspace/db", () => {
  const insertMock = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([{}]) });
  const dbMock = {
    select: vi.fn(),
    insert: insertMock,
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    db: dbMock,
    paprikaCredentialsTable: { id: "paprikaCredentialsTable" },
    recipesTable: { id: "recipesTable", paprikaUid: "paprika_uid" },
  };
});

vi.mock("../lib/paprika", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/paprika")>();
  return {
    ...actual,
    fetchPaprikaCategories: vi.fn(),
    fetchPaprikaRecipeList: vi.fn(),
    fetchPaprikaRecipeDetail: vi.fn(),
  };
});

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {},
}));

describe("POST /api/paprika/import", () => {
  let app: any;
  let db: any;
  let paprikaLib: any;

  beforeEach(async () => {
    vi.resetModules();

    // Re-import after mocks are reset
    const dbModule = await import("@workspace/db");
    db = dbModule.db;
    paprikaLib = await import("../lib/paprika");

    const { default: expressApp } = await import("../app");
    app = expressApp;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when credentials are not configured", async () => {
    const { db } = await import("@workspace/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    const { default: supertest } = await import("supertest");
    const res = await supertest(app)
      .post("/api/paprika/import")
      .expect(400);

    expect(res.body.error).toContain("No Paprika credentials");
  });

  it("imports new recipes and skips existing ones", async () => {
    const { db } = await import("@workspace/db");
    const paprika = await import("../lib/paprika");

    // First call: get credentials
    // Second call: get existing paprika UIDs from recipes table
    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCreds]),
          }),
        } as any;
      }
      // Second select: existing paprika UIDs — paprika-uid-1 already exists
      return {
        from: vi.fn().mockReturnValue(
          Promise.resolve([{ paprikaUid: "paprika-uid-1" }])
        ),
      } as any;
    });

    vi.mocked(paprika.fetchPaprikaCategories).mockResolvedValue(mockCategories);
    vi.mocked(paprika.fetchPaprikaRecipeList).mockResolvedValue(mockRecipeList);
    vi.mocked(paprika.fetchPaprikaRecipeDetail)
      .mockResolvedValueOnce(makeRawRecipe("paprika-uid-2", "Chicken Soup") as any)
      .mockResolvedValueOnce(makeRawRecipe("paprika-uid-3", "Veggie Stew") as any);

    const insertValues = vi.fn().mockResolvedValue([{}]);
    vi.mocked(db.insert).mockReturnValue({ values: insertValues } as any);

    const { default: supertest } = await import("supertest");
    const res = await supertest(app)
      .post("/api/paprika/import")
      .expect(200);

    expect(res.body.found).toBe(3);
    expect(res.body.imported).toBe(2);
    expect(res.body.skipped).toBe(1);
    expect(res.body.errors).toEqual([]);
    expect(insertValues).toHaveBeenCalledTimes(2);
  });

  it("skips deleted recipes", async () => {
    const { db } = await import("@workspace/db");
    const paprika = await import("../lib/paprika");

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCreds]),
          }),
        } as any;
      }
      return {
        from: vi.fn().mockReturnValue(Promise.resolve([])),
      } as any;
    });

    vi.mocked(paprika.fetchPaprikaCategories).mockResolvedValue(mockCategories);
    vi.mocked(paprika.fetchPaprikaRecipeList).mockResolvedValue([
      { uid: "deleted-uid", hash: "hash-d" },
    ]);
    vi.mocked(paprika.fetchPaprikaRecipeDetail).mockResolvedValueOnce(
      makeRawRecipe("deleted-uid", "Deleted Recipe", true) as any
    );

    const insertValues = vi.fn().mockResolvedValue([{}]);
    vi.mocked(db.insert).mockReturnValue({ values: insertValues } as any);

    const { default: supertest } = await import("supertest");
    const res = await supertest(app)
      .post("/api/paprika/import")
      .expect(200);

    expect(res.body.found).toBe(1);
    expect(res.body.imported).toBe(0);
    expect(res.body.skipped).toBe(1);
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("marks imported recipes as exportedToPaprika and sets paprikaUid", async () => {
    const { db } = await import("@workspace/db");
    const paprika = await import("../lib/paprika");

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCreds]),
          }),
        } as any;
      }
      return {
        from: vi.fn().mockReturnValue(Promise.resolve([])),
      } as any;
    });

    vi.mocked(paprika.fetchPaprikaCategories).mockResolvedValue(mockCategories);
    vi.mocked(paprika.fetchPaprikaRecipeList).mockResolvedValue([
      { uid: "new-uid", hash: "hash-n" },
    ]);
    vi.mocked(paprika.fetchPaprikaRecipeDetail).mockResolvedValueOnce(
      makeRawRecipe("new-uid", "New Recipe") as any
    );

    const insertValues = vi.fn().mockResolvedValue([{}]);
    vi.mocked(db.insert).mockReturnValue({ values: insertValues } as any);

    const { default: supertest } = await import("supertest");
    await supertest(app).post("/api/paprika/import").expect(200);

    const insertedData = insertValues.mock.calls[0][0];
    expect(insertedData.exportedToPaprika).toBe(true);
    expect(insertedData.paprikaUid).toBe("new-uid");
    expect(typeof insertedData.rating).toBe("number");
  });

  it("handles Paprika API fetch failure gracefully", async () => {
    const { db } = await import("@workspace/db");
    const paprika = await import("../lib/paprika");

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([mockCreds]),
      }),
    } as any);

    vi.mocked(paprika.fetchPaprikaCategories).mockRejectedValue(
      new Error("Network error")
    );
    vi.mocked(paprika.fetchPaprikaRecipeList).mockRejectedValue(
      new Error("Network error")
    );

    const { default: supertest } = await import("supertest");
    const res = await supertest(app)
      .post("/api/paprika/import")
      .expect(500);

    expect(res.body.error).toContain("Failed to fetch from Paprika");
  });

  it("returns 0 found, imported, and skipped when recipe list is empty", async () => {
    const { db } = await import("@workspace/db");
    const paprika = await import("../lib/paprika");

    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return {
          from: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockCreds]),
          }),
        } as any;
      }
      return {
        from: vi.fn().mockReturnValue(Promise.resolve([])),
      } as any;
    });

    vi.mocked(paprika.fetchPaprikaCategories).mockResolvedValue([]);
    vi.mocked(paprika.fetchPaprikaRecipeList).mockResolvedValue([]);

    const { default: supertest } = await import("supertest");
    const res = await supertest(app)
      .post("/api/paprika/import")
      .expect(200);

    expect(res.body.found).toBe(0);
    expect(res.body.imported).toBe(0);
    expect(res.body.skipped).toBe(0);
    expect(res.body.errors).toEqual([]);
  });
});
