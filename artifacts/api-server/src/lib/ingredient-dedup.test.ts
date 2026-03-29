import { describe, it, expect } from "vitest";
import {
  normalizeName,
  normalizeUnit,
  mergeQuantities,
  findMatchingItem,
  type CartItemLike,
} from "./ingredient-dedup";

// ---------------------------------------------------------------------------
// normalizeName
// ---------------------------------------------------------------------------

describe("normalizeName", () => {
  it("lowercases input", () => {
    expect(normalizeName("Banana")).toBe("banana");
  });

  it("strips trailing 's' for plural ingredients", () => {
    expect(normalizeName("bananas")).toBe("banana");
    expect(normalizeName("carrots")).toBe("carrot");
    expect(normalizeName("onions")).toBe("onion");
  });

  it("converts ies → y (raspberries → raspberry)", () => {
    expect(normalizeName("raspberries")).toBe("raspberry");
    expect(normalizeName("blueberries")).toBe("blueberry");
    expect(normalizeName("strawberries")).toBe("strawberry");
  });

  it("converts ves → f (leaves → leaf, loaves → loaf)", () => {
    expect(normalizeName("leaves")).toBe("leaf");
    expect(normalizeName("loaves")).toBe("loaf");
  });

  it("converts oes → o (tomatoes → tomato, potatoes → potato)", () => {
    expect(normalizeName("tomatoes")).toBe("tomato");
    expect(normalizeName("potatoes")).toBe("potato");
  });

  it("handles exception words that end in 's' but are not plural", () => {
    expect(normalizeName("oats")).toBe("oats");
    expect(normalizeName("shrimp")).toBe("shrimp");
    expect(normalizeName("lentils")).toBe("lentils");
    expect(normalizeName("chips")).toBe("chips");
  });

  it("normalizes each word in multi-word ingredients", () => {
    expect(normalizeName("chicken breasts")).toBe("chicken breast");
    expect(normalizeName("cherry tomatoes")).toBe("cherry tomato");
    expect(normalizeName("bay leaves")).toBe("bay leaf");
  });

  it("returns singular as-is", () => {
    expect(normalizeName("banana")).toBe("banana");
    expect(normalizeName("egg")).toBe("egg");
  });
});

// ---------------------------------------------------------------------------
// normalizeUnit
// ---------------------------------------------------------------------------

describe("normalizeUnit", () => {
  it("returns already-canonical units unchanged", () => {
    expect(normalizeUnit("cup")).toBe("cup");
    expect(normalizeUnit("lb")).toBe("lb");
    expect(normalizeUnit("oz")).toBe("oz");
    expect(normalizeUnit("tsp")).toBe("tsp");
    expect(normalizeUnit("tbsp")).toBe("tbsp");
  });

  it("normalizes plural volume units", () => {
    expect(normalizeUnit("cups")).toBe("cup");
    expect(normalizeUnit("tablespoons")).toBe("tbsp");
    expect(normalizeUnit("teaspoons")).toBe("tsp");
    expect(normalizeUnit("quarts")).toBe("quart");
    expect(normalizeUnit("gallons")).toBe("gallon");
  });

  it("normalizes plural weight units", () => {
    expect(normalizeUnit("pounds")).toBe("lb");
    expect(normalizeUnit("ounces")).toBe("oz");
    expect(normalizeUnit("grams")).toBe("g");
    expect(normalizeUnit("kilograms")).toBe("kg");
  });

  it("normalizes written-out unit names", () => {
    expect(normalizeUnit("tablespoon")).toBe("tbsp");
    expect(normalizeUnit("teaspoon")).toBe("tsp");
    expect(normalizeUnit("pound")).toBe("lb");
    expect(normalizeUnit("ounce")).toBe("oz");
  });

  it("is case-insensitive", () => {
    expect(normalizeUnit("Cups")).toBe("cup");
    expect(normalizeUnit("LBS")).toBe("lb");
    expect(normalizeUnit("TBSP")).toBe("tbsp");
  });

  it("strips trailing periods", () => {
    expect(normalizeUnit("oz.")).toBe("oz");
    expect(normalizeUnit("lb.")).toBe("lb");
  });

  it("returns unknown units unchanged", () => {
    expect(normalizeUnit("pinch")).toBe("pinch");
    expect(normalizeUnit("bunch")).toBe("bunch");
    expect(normalizeUnit("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// mergeQuantities
// ---------------------------------------------------------------------------

describe("mergeQuantities", () => {
  it("adds two quantities with the same unit", () => {
    const result = mergeQuantities(2, "lb", 1, "lb");
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(3);
    expect(result!.unit).toBe("lb");
  });

  it("adds count-based items (no unit)", () => {
    const result = mergeQuantities(3, "", 5, "");
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe(8);
    expect(result!.unit).toBe("");
  });

  it("merges volumes across different units (cups + tablespoons)", () => {
    // 1 cup = 16 tbsp → total 17 tbsp; 17 tbsp > 1 cup threshold so it stays as cups
    const result = mergeQuantities(1, "cup", 1, "tbsp");
    expect(result).not.toBeNull();
    expect(result!.unit).toBe("cup");
    expect(result!.quantity).toBeCloseTo(1 + 1 / 16, 3);
  });

  it("merges weights across different units (oz + lb)", () => {
    // 8 oz + 1 lb = 8 oz + 16 oz = 24 oz = 1.5 lb → bestWeightUnit selects lb
    const result = mergeQuantities(8, "oz", 1, "lb");
    expect(result).not.toBeNull();
    expect(result!.unit).toBe("lb");
    expect(result!.quantity).toBeCloseTo(1.5, 3);
  });

  it("merges weights across different units (g + kg)", () => {
    const result = mergeQuantities(500, "g", 1, "kg");
    expect(result).not.toBeNull();
    expect(result!.unit).toBe("kg");
    expect(result!.quantity).toBeCloseTo(1.5, 3);
  });

  it("returns null for incompatible units (volume vs weight)", () => {
    const result = mergeQuantities(1, "cup", 1, "oz");
    expect(result).toBeNull();
  });

  it("returns null when one unit is a count and the other is not", () => {
    const result = mergeQuantities(3, "", 2, "lb");
    expect(result).toBeNull();
  });

  it("normalizes unit aliases before merging", () => {
    // "cups" and "cup" are the same
    const result = mergeQuantities(1, "cup", 1, "cups");
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(2);
    expect(result!.unit).toBe("cup");
  });
});

// ---------------------------------------------------------------------------
// findMatchingItem
// ---------------------------------------------------------------------------

describe("findMatchingItem", () => {
  const ITEMS: CartItemLike[] = [
    { id: 1, name: "banana", quantity: "2", unit: "" },
    { id: 2, name: "chicken breast", quantity: "1", unit: "lb" },
    { id: 3, name: "milk", quantity: "1", unit: "cup" },
  ];

  it("returns exact match by name", () => {
    const match = findMatchingItem(ITEMS, "banana", "");
    expect(match).not.toBeNull();
    expect(match!.id).toBe(1);
  });

  it("matches plural form to singular (bananas → banana)", () => {
    const match = findMatchingItem(ITEMS, "bananas", "");
    expect(match).not.toBeNull();
    expect(match!.id).toBe(1);
  });

  it("matches singular form to plural (banana → bananas stored as banana)", () => {
    const items: CartItemLike[] = [
      { id: 1, name: "bananas", quantity: "3", unit: "" },
    ];
    const match = findMatchingItem(items, "banana", "");
    expect(match).not.toBeNull();
    expect(match!.id).toBe(1);
  });

  it("matches multi-word plural (chicken breasts → chicken breast)", () => {
    const match = findMatchingItem(ITEMS, "chicken breasts", "lb");
    expect(match).not.toBeNull();
    expect(match!.id).toBe(2);
  });

  it("returns null when name does not match anything", () => {
    const match = findMatchingItem(ITEMS, "steak", "lb");
    expect(match).toBeNull();
  });

  it("returns null when name matches but units are incompatible", () => {
    // milk is stored as cups; incoming is oz (weight) — incompatible families
    const match = findMatchingItem(ITEMS, "milk", "oz");
    expect(match).toBeNull();
  });

  it("matches when units are in the same family (oz and lb both weight)", () => {
    const match = findMatchingItem(ITEMS, "chicken breast", "oz");
    expect(match).not.toBeNull();
    expect(match!.id).toBe(2);
  });

  it("returns null for empty candidates list", () => {
    const match = findMatchingItem([], "banana", "");
    expect(match).toBeNull();
  });
});
