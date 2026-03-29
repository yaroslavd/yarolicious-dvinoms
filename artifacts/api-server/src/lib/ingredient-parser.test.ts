import { describe, it, expect } from "vitest";
import { parseIngredient } from "./ingredient-parser";

describe("parseIngredient", () => {
  describe("quantity parsing", () => {
    it("parses a whole number quantity", () => {
      const result = parseIngredient("3 bananas");
      expect(result.quantity).toBe(3);
      expect(result.name).toBe("bananas");
    });

    it("parses a decimal quantity", () => {
      const result = parseIngredient("2.5 cups flour");
      expect(result.quantity).toBe(2.5);
      expect(result.unit).toBe("cups");
      expect(result.name).toBe("flour");
    });

    it("parses a slash fraction (1/2)", () => {
      const result = parseIngredient("1/2 cup butter");
      expect(result.quantity).toBeCloseTo(0.5);
      expect(result.unit).toBe("cup");
      expect(result.name).toBe("butter");
    });

    it("parses a slash fraction (3/4)", () => {
      const result = parseIngredient("3/4 cup milk");
      expect(result.quantity).toBeCloseTo(0.75);
    });

    it("parses a unicode fraction (½)", () => {
      const result = parseIngredient("½ tsp salt");
      expect(result.quantity).toBeCloseTo(0.5);
      expect(result.unit).toBe("tsp");
      expect(result.name).toBe("salt");
    });

    it("parses a unicode fraction (¼)", () => {
      const result = parseIngredient("¼ cup sugar");
      expect(result.quantity).toBeCloseTo(0.25);
    });

    it("parses a mixed number with slash fraction (1 1/2)", () => {
      const result = parseIngredient("1 1/2 cups milk");
      expect(result.quantity).toBeCloseTo(1.5);
      expect(result.unit).toBe("cups");
      expect(result.name).toBe("milk");
    });

    it("parses a mixed number with unicode fraction (2½)", () => {
      const result = parseIngredient("2½ cups flour");
      expect(result.quantity).toBeCloseTo(2.5);
    });

    it("parses a range and returns the average (2-3)", () => {
      const result = parseIngredient("2-3 stalks celery");
      expect(result.quantity).toBeCloseTo(2.5);
      expect(result.name).toBe("celery");
    });

    it("defaults quantity to 1 when no number is present", () => {
      const result = parseIngredient("salt");
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe("");
      expect(result.name).toBe("salt");
    });
  });

  describe("unit parsing", () => {
    it("parses weight units (lb)", () => {
      const result = parseIngredient("2 lb chicken breast");
      expect(result.quantity).toBe(2);
      expect(result.unit).toBe("lb");
      expect(result.name).toBe("chicken breast");
    });

    it("parses weight units (oz)", () => {
      const result = parseIngredient("8 oz shrimp");
      expect(result.quantity).toBe(8);
      expect(result.unit).toBe("oz");
      expect(result.name).toBe("shrimp");
    });

    it("parses volume units (cup)", () => {
      const result = parseIngredient("1 cup flour");
      expect(result.unit).toBe("cup");
      expect(result.name).toBe("flour");
    });

    it("parses volume units (tablespoon)", () => {
      const result = parseIngredient("2 tablespoons butter");
      expect(result.unit).toBe("tablespoons");
      expect(result.name).toBe("butter");
    });

    it("parses volume units (tsp)", () => {
      const result = parseIngredient("1 tsp vanilla extract");
      expect(result.unit).toBe("tsp");
      expect(result.name).toBe("vanilla extract");
    });

    it("strips 'of' between unit and ingredient name", () => {
      const result = parseIngredient("1 cup of flour");
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe("cup");
      expect(result.name).toBe("flour");
    });

    it("returns empty string unit for count-based ingredients", () => {
      const result = parseIngredient("3 eggs");
      expect(result.unit).toBe("");
      expect(result.name).toBe("eggs");
    });
  });

  describe("name parsing", () => {
    it("preserves multi-word ingredient names", () => {
      const result = parseIngredient("2 cups all-purpose flour");
      expect(result.name).toBe("all-purpose flour");
    });

    it("handles ingredient with no quantity or unit", () => {
      const result = parseIngredient("fresh herbs");
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe("");
      expect(result.name).toBe("fresh herbs");
    });

    it("handles grams unit (metric)", () => {
      const result = parseIngredient("100 g chocolate");
      expect(result.quantity).toBe(100);
      expect(result.unit).toBe("g");
      expect(result.name).toBe("chocolate");
    });
  });
});
