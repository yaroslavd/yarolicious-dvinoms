import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { deterministicRecipeUid } from "../lib/paprika";

vi.mock("@workspace/db", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  };
  return {
    db: mockDb,
    paprikaCredentialsTable: { $inferSelect: {} },
    recipesTable: { $inferSelect: {} },
  };
});

vi.mock("../lib/paprika", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/paprika")>();
  return {
    ...original,
    validatePaprikaCredentials: vi.fn(),
    fetchPaprikaCategories: vi.fn(),
    syncRecipeToPaprika: vi.fn(),
  };
});

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  },
}));

import { db } from "@workspace/db";
import {
  fetchPaprikaCategories,
  syncRecipeToPaprika,
} from "../lib/paprika";
import { openai } from "@workspace/integrations-openai-ai-server";

function makeSelectChain(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(returnValue));
  chain.orderBy = vi.fn(() => Promise.resolve(returnValue));
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => Promise.resolve([]));
  return chain;
}

const MOCK_CREDS = [
  {
    id: 1,
    email: "chef@example.com",
    encryptedPassword: Buffer.from("secret").toString("base64"),
  },
];

const MOCK_CATEGORIES = [
  { uid: "cat-soups", name: "Soups", order_flag: 0, parent_uid: null },
  { uid: "cat-nytimes", name: "NYTimes", order_flag: 1, parent_uid: null },
];

const MOCK_RECIPE = {
  id: 42,
  name: "Minestrone",
  description: null,
  ingredients: "pasta, vegetables",
  directions: "cook",
  servings: null,
  totalTime: null,
  prepTime: null,
  cookTime: null,
  notes: null,
  nutritionalInfo: null,
  source: null,
  sourceUrl: "https://nytimes.com/recipes/minestrone",
  imageUrl: null,
  categories: null,
  difficulty: null,
  exportedToPaprika: false,
  paprikaUid: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("POST /api/paprika/categorize-preview", () => {
  let app: Express.Application;

  beforeEach(async () => {
    const { default: expressApp } = await import("../app");
    app = expressApp;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when no credentials are configured", async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);

    const res = await request(app).post("/api/paprika/categorize-preview");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no paprika credentials/i);
  });

  it("returns suggestions when AI responds with category assignments", async () => {
    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return makeSelectChain(MOCK_CREDS) as never;
      }
      return makeSelectChain([MOCK_RECIPE]) as never;
    });

    vi.mocked(fetchPaprikaCategories).mockResolvedValue(MOCK_CATEGORIES);

    vi.mocked(
      (openai as typeof openai).chat.completions.create
    ).mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              results: [{ recipeId: MOCK_RECIPE.id, categoryNames: ["NYTimes"] }],
            }),
          },
        },
      ],
    } as never);

    const res = await request(app).post("/api/paprika/categorize-preview");
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toBeDefined();
    expect(Array.isArray(res.body.suggestions)).toBe(true);

    const suggestion = res.body.suggestions.find(
      (s: { recipeId: number }) => s.recipeId === MOCK_RECIPE.id
    );
    expect(suggestion).toBeDefined();
    expect(suggestion.toAdd.map((c: { name: string }) => c.name)).toContain("NYTimes");
  });

  it("returns 400 when no recipes exist", async () => {
    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return makeSelectChain(MOCK_CREDS) as never;
      }
      return makeSelectChain([]) as never;
    });

    vi.mocked(fetchPaprikaCategories).mockResolvedValue(MOCK_CATEGORIES);

    const res = await request(app).post("/api/paprika/categorize-preview");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no recipes/i);
  });
});

describe("POST /api/paprika/categorize-apply — duplicate UID prevention", () => {
  let app: Express.Application;

  const EXPECTED_UID = deterministicRecipeUid(MOCK_RECIPE.id);

  beforeEach(async () => {
    const { default: expressApp } = await import("../app");
    app = expressApp;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function setupDbMocks() {
    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeSelectChain(MOCK_CREDS) as never;
      return makeSelectChain([MOCK_RECIPE]) as never;
    });
    vi.mocked(db.update).mockReturnValue(makeUpdateChain() as never);
    vi.mocked(fetchPaprikaCategories).mockResolvedValue(MOCK_CATEGORIES);
  }

  const APPLY_BODY = {
    applications: [
      {
        recipeId: MOCK_RECIPE.id,
        categoryUids: ["cat-nytimes"],
        categoryNames: ["NYTimes"],
      },
    ],
  };

  it("calls syncRecipeToPaprika with the same deterministic UID on first and second sync — no duplicate Paprika entries", async () => {
    vi.mocked(syncRecipeToPaprika).mockResolvedValue({
      success: true,
      uid: EXPECTED_UID,
      message: "ok",
    });

    setupDbMocks();
    const res1 = await request(app)
      .post("/api/paprika/categorize-apply")
      .send(APPLY_BODY)
      .set("Content-Type", "application/json");
    expect(res1.status).toBe(200);
    expect(res1.body.applied).toBe(1);

    setupDbMocks();
    const res2 = await request(app)
      .post("/api/paprika/categorize-apply")
      .send(APPLY_BODY)
      .set("Content-Type", "application/json");
    expect(res2.status).toBe(200);
    expect(res2.body.applied).toBe(1);

    const syncCalls = vi.mocked(syncRecipeToPaprika).mock.calls;
    expect(syncCalls).toHaveLength(2);

    const firstArg = syncCalls[0][2];
    const secondArg = syncCalls[1][2];

    expect(firstArg.dbId).toBe(MOCK_RECIPE.id);
    expect(secondArg.dbId).toBe(MOCK_RECIPE.id);

    const uid1 = deterministicRecipeUid(firstArg.dbId);
    const uid2 = deterministicRecipeUid(secondArg.dbId);
    expect(uid1).toBe(EXPECTED_UID);
    expect(uid2).toBe(EXPECTED_UID);
    expect(uid1).toBe(uid2);

    const dbInsertCalls = vi.mocked(db.insert).mock.calls;
    expect(dbInsertCalls).toHaveLength(0);

    const dbUpdateCalls = vi.mocked(db.update).mock.calls;
    expect(dbUpdateCalls.length).toBeGreaterThan(0);
  });

  it("persists the paprikaUid returned from syncRecipeToPaprika to the DB record on each sync (upsert, not insert)", async () => {
    vi.mocked(syncRecipeToPaprika).mockResolvedValue({
      success: true,
      uid: EXPECTED_UID,
      message: "ok",
    });

    const updateSetSpy = vi.fn(() => makeUpdateChain());
    vi.mocked(db.update).mockReturnValue({ set: updateSetSpy } as never);

    setupDbMocks();
    vi.mocked(db.update).mockReturnValue({ set: updateSetSpy } as never);

    await request(app)
      .post("/api/paprika/categorize-apply")
      .send(APPLY_BODY)
      .set("Content-Type", "application/json");

    const persistCall = updateSetSpy.mock.calls.find(
      ([setArg]: [Record<string, unknown>]) =>
        setArg.paprikaUid === EXPECTED_UID && setArg.exportedToPaprika === true
    );
    expect(persistCall).toBeDefined();
  });

  it("does not call syncRecipeToPaprika and returns applied=0 when no categories are submitted", async () => {
    vi.mocked(db.select).mockReturnValue(makeSelectChain(MOCK_CREDS) as never);
    vi.mocked(fetchPaprikaCategories).mockResolvedValue(MOCK_CATEGORIES);

    const res = await request(app)
      .post("/api/paprika/categorize-apply")
      .send({ applications: [{ recipeId: MOCK_RECIPE.id, categoryUids: [], categoryNames: [] }] })
      .set("Content-Type", "application/json");

    expect(res.status).toBe(200);
    expect(res.body.applied).toBe(0);
    expect(vi.mocked(syncRecipeToPaprika)).not.toHaveBeenCalled();
  });
});
