import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Integration tests for the shopping cart API routes.
 *
 * DB, aisle-categorizer, and thumbnail-generator are all mocked so tests
 * run without a real database or OpenAI connection.
 */

// ---------------------------------------------------------------------------
// Module mocks — declared before any imports so Vitest hoists them
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return {
    db: mockDb,
    // Minimal column shape; eq() from drizzle-orm only needs a truthy left-hand value
    shoppingCartItemsTable: {
      id: "id",
      name: "name",
      quantity: "quantity",
      unit: "unit",
      aisle: "aisle",
      checked: "checked",
      thumbnailUrl: "thumbnail_url",
    },
  };
});

vi.mock("../lib/aisle-categorizer", () => ({
  categorizeIngredient: vi.fn(),
}));

vi.mock("../lib/thumbnail-generator", () => ({
  generateIngredientThumbnail: vi.fn(),
  PLACEHOLDER_THUMBNAIL: "",
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BANANA_ITEM = {
  id: 1,
  name: "banana",
  quantity: "2",
  unit: "",
  aisle: "Produce",
  checked: false,
  thumbnailUrl: null,
};

const CHICKEN_ITEM = {
  id: 2,
  name: "chicken breast",
  quantity: "1",
  unit: "lb",
  aisle: "Meat & Seafood",
  checked: false,
  thumbnailUrl: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Shopping Cart API", () => {
  let app: any;
  let db: any;
  let categorizeIngredient: any;
  let generateIngredientThumbnail: any;

  beforeEach(async () => {
    vi.resetModules();

    const dbModule = await import("@workspace/db");
    db = dbModule.db;

    const aisleModule = await import("../lib/aisle-categorizer");
    categorizeIngredient = aisleModule.categorizeIngredient;

    const thumbModule = await import("../lib/thumbnail-generator");
    generateIngredientThumbnail = thumbModule.generateIngredientThumbnail;

    const { default: expressApp } = await import("../app");
    app = expressApp;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // GET /api/cart
  // =========================================================================

  describe("GET /api/cart", () => {
    it("returns all cart items ordered by aisle and name", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([BANANA_ITEM, CHICKEN_ITEM]),
        }),
      } as any);

      const res = await supertest(app).get("/api/cart").expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe("banana");
      expect(res.body[1].name).toBe("chicken breast");
    });

    it("returns an empty array when cart is empty", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const res = await supertest(app).get("/api/cart").expect(200);
      expect(res.body).toEqual([]);
    });
  });

  // =========================================================================
  // POST /api/cart/items
  // =========================================================================

  describe("POST /api/cart/items", () => {
    it("returns 400 when ingredients field is missing", async () => {
      const { default: supertest } = await import("supertest");

      const res = await supertest(app)
        .post("/api/cart/items")
        .send({})
        .expect(400);

      expect(res.body.error).toMatch(/ingredients/i);
    });

    it("returns 400 when ingredients is an empty array", async () => {
      const { default: supertest } = await import("supertest");

      const res = await supertest(app)
        .post("/api/cart/items")
        .send({ ingredients: [] })
        .expect(400);

      expect(res.body.error).toMatch(/ingredients/i);
    });

    it("adds a new item and returns 201 with the saved item", async () => {
      const { default: supertest } = await import("supertest");

      // No existing items in cart
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([]),
      } as any);

      vi.mocked(categorizeIngredient).mockResolvedValue("Produce");
      vi.mocked(generateIngredientThumbnail).mockResolvedValue(null);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([BANANA_ITEM]),
        }),
      } as any);

      const res = await supertest(app)
        .post("/api/cart/items")
        .send({ ingredients: ["2 bananas"] })
        .expect(201);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("banana");
      expect(res.body[0].quantity).toBe("2");
      expect(db.insert).toHaveBeenCalledOnce();
    });

    it("calls categorizeIngredient to assign the correct aisle", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([]),
      } as any);

      vi.mocked(categorizeIngredient).mockResolvedValue("Meat & Seafood");

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([CHICKEN_ITEM]),
        }),
      } as any);

      vi.mocked(generateIngredientThumbnail).mockResolvedValue(null);

      await supertest(app)
        .post("/api/cart/items")
        .send({ ingredients: ["2 lb chicken breast"] })
        .expect(201);

      expect(categorizeIngredient).toHaveBeenCalledWith("chicken breast");
    });

    it("deduplicates by updating quantity when same ingredient already exists", async () => {
      const { default: supertest } = await import("supertest");

      // Cart already has 2 bananas
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([BANANA_ITEM]),
      } as any);

      const updatedBanana = { ...BANANA_ITEM, quantity: "5" };
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedBanana]),
          }),
        }),
      } as any);

      const res = await supertest(app)
        .post("/api/cart/items")
        .send({ ingredients: ["3 bananas"] })
        .expect(201);

      // Should update, not insert
      expect(db.update).toHaveBeenCalledOnce();
      expect(db.insert).not.toHaveBeenCalled();
      expect(res.body[0].quantity).toBe("5");
    });

    it("deduplicates plural form (bananas matches banana)", async () => {
      const { default: supertest } = await import("supertest");

      // Cart has "banana" (singular)
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([BANANA_ITEM]),
      } as any);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...BANANA_ITEM, quantity: "5" }]),
          }),
        }),
      } as any);

      await supertest(app)
        .post("/api/cart/items")
        .send({ ingredients: ["3 bananas"] }) // plural
        .expect(201);

      // Should merge with the existing "banana" item
      expect(db.update).toHaveBeenCalledOnce();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("merges weight units (oz + lb) into a combined quantity", async () => {
      const { default: supertest } = await import("supertest");

      // 8 oz chicken already in cart
      const chickenOz = { ...CHICKEN_ITEM, quantity: "8", unit: "oz" };
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([chickenOz]),
      } as any);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...chickenOz, quantity: "1.5", unit: "lb" }]),
          }),
        }),
      } as any);

      const res = await supertest(app)
        .post("/api/cart/items")
        .send({ ingredients: ["1 lb chicken breast"] })
        .expect(201);

      // Weight units merged — should update, not insert
      expect(db.update).toHaveBeenCalledOnce();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("adds a new item even when cart already has a different ingredient", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([BANANA_ITEM]),
      } as any);

      vi.mocked(categorizeIngredient).mockResolvedValue("Meat & Seafood");
      vi.mocked(generateIngredientThumbnail).mockResolvedValue(null);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([CHICKEN_ITEM]),
        }),
      } as any);

      const res = await supertest(app)
        .post("/api/cart/items")
        .send({ ingredients: ["1 lb chicken breast"] })
        .expect(201);

      expect(db.insert).toHaveBeenCalledOnce();
      expect(res.body[0].name).toBe("chicken breast");
    });

    it("triggers async thumbnail generation for new items", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([]),
      } as any);
      vi.mocked(categorizeIngredient).mockResolvedValue("Produce");
      vi.mocked(generateIngredientThumbnail).mockResolvedValue(null);
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([BANANA_ITEM]),
        }),
      } as any);

      await supertest(app)
        .post("/api/cart/items")
        .send({ ingredients: ["2 bananas"] })
        .expect(201);

      // Thumbnail generation is fire-and-forget — verify it was called with
      // the parsed ingredient name (parser preserves the raw plural form)
      expect(generateIngredientThumbnail).toHaveBeenCalledWith("bananas");
    });
  });

  // =========================================================================
  // PATCH /api/cart/items/:id (update quantity + unit)
  // =========================================================================

  describe("PATCH /api/cart/items/:id", () => {
    it("updates quantity and unit for an existing item", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([BANANA_ITEM]),
        }),
      } as any);

      const updated = { ...BANANA_ITEM, quantity: "5", unit: "" };
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      } as any);

      const res = await supertest(app)
        .patch("/api/cart/items/1")
        .send({ quantity: 5, unit: "" })
        .expect(200);

      expect(res.body.quantity).toBe("5");
    });

    it("returns 404 when item does not exist", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const res = await supertest(app)
        .patch("/api/cart/items/999")
        .send({ quantity: 3, unit: "" })
        .expect(404);

      expect(res.body.error).toMatch(/not found/i);
    });

    it("returns 400 for a non-numeric id", async () => {
      const { default: supertest } = await import("supertest");

      const res = await supertest(app)
        .patch("/api/cart/items/abc")
        .send({ quantity: 1, unit: "" })
        .expect(400);

      expect(res.body.error).toMatch(/invalid id/i);
    });

    it("returns 400 when quantity is missing", async () => {
      const { default: supertest } = await import("supertest");

      const res = await supertest(app)
        .patch("/api/cart/items/1")
        .send({ unit: "lb" })
        .expect(400);

      expect(res.body.error).toMatch(/quantity/i);
    });

    it("returns 400 when quantity is zero or negative", async () => {
      const { default: supertest } = await import("supertest");

      const res = await supertest(app)
        .patch("/api/cart/items/1")
        .send({ quantity: 0, unit: "" })
        .expect(400);

      expect(res.body.error).toMatch(/quantity/i);
    });

    it("returns 400 when unit is not provided", async () => {
      const { default: supertest } = await import("supertest");

      const res = await supertest(app)
        .patch("/api/cart/items/1")
        .send({ quantity: 2 })
        .expect(400);

      expect(res.body.error).toMatch(/unit/i);
    });
  });

  // =========================================================================
  // PATCH /api/cart/items/:id/toggle
  // =========================================================================

  describe("PATCH /api/cart/items/:id/toggle", () => {
    it("toggles checked from false to true", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([BANANA_ITEM]),
        }),
      } as any);

      const toggled = { ...BANANA_ITEM, checked: true };
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([toggled]),
          }),
        }),
      } as any);

      const res = await supertest(app)
        .patch("/api/cart/items/1/toggle")
        .expect(200);

      expect(res.body.checked).toBe(true);
    });

    it("toggles checked from true back to false", async () => {
      const { default: supertest } = await import("supertest");

      const checkedItem = { ...BANANA_ITEM, checked: true };
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([checkedItem]),
        }),
      } as any);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...checkedItem, checked: false }]),
          }),
        }),
      } as any);

      const res = await supertest(app)
        .patch("/api/cart/items/1/toggle")
        .expect(200);

      expect(res.body.checked).toBe(false);
    });

    it("returns 404 when item does not exist", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const res = await supertest(app)
        .patch("/api/cart/items/999/toggle")
        .expect(404);

      expect(res.body.error).toMatch(/not found/i);
    });

    it("returns 400 for a non-numeric id", async () => {
      const { default: supertest } = await import("supertest");

      const res = await supertest(app)
        .patch("/api/cart/items/abc/toggle")
        .expect(400);

      expect(res.body.error).toMatch(/invalid id/i);
    });
  });

  // =========================================================================
  // DELETE /api/cart/items/:id
  // =========================================================================

  describe("DELETE /api/cart/items/:id", () => {
    it("deletes an item and returns 204", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      } as any);

      await supertest(app).delete("/api/cart/items/1").expect(204);

      expect(db.delete).toHaveBeenCalledOnce();
    });

    it("returns 400 for a non-numeric id", async () => {
      const { default: supertest } = await import("supertest");

      const res = await supertest(app)
        .delete("/api/cart/items/abc")
        .expect(400);

      expect(res.body.error).toMatch(/invalid id/i);
    });
  });

  // =========================================================================
  // DELETE /api/cart  (bulk clear)
  // =========================================================================

  describe("DELETE /api/cart", () => {
    it("clears all items when mode=all", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      } as any);
      // mode=all calls db.delete() directly without .where()
      vi.mocked(db.delete).mockReturnValue(Promise.resolve([]) as any);

      await supertest(app).delete("/api/cart?mode=all").expect(204);
    });

    it("clears only checked items when mode=checked", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      } as any);

      await supertest(app).delete("/api/cart?mode=checked").expect(204);

      // .where() is called to filter to checked=true items
      const deleteMock = vi.mocked(db.delete).mock.results[0]?.value;
      expect(deleteMock?.where).toHaveBeenCalled();
    });

    it("defaults to mode=all when mode param is absent", async () => {
      const { default: supertest } = await import("supertest");

      vi.mocked(db.delete).mockReturnValue(Promise.resolve([]) as any);

      await supertest(app).delete("/api/cart").expect(204);
    });

    it("returns 400 for an invalid mode value", async () => {
      const { default: supertest } = await import("supertest");

      const res = await supertest(app)
        .delete("/api/cart?mode=invalid")
        .expect(400);

      expect(res.body.error).toMatch(/mode/i);
    });

    it("returns 400 for mode=CHECKED (case-sensitive validation)", async () => {
      const { default: supertest } = await import("supertest");

      const res = await supertest(app)
        .delete("/api/cart?mode=CHECKED")
        .expect(400);

      expect(res.body.error).toMatch(/mode/i);
    });
  });
});
