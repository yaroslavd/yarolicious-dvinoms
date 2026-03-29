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

    it("defaults quantity to 0 when no number is present", () => {
      const result = parseIngredient("salt");
      expect(result.quantity).toBe(0);
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
      expect(result.quantity).toBe(0);
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

  describe("purpose qualifier stripping", () => {
    it("strips ', for dusting' from name", () => {
      const result = parseIngredient("Confectioners' sugar, for dusting");
      expect(result.quantity).toBe(0);
      expect(result.unit).toBe("");
      expect(result.name).toBe("Confectioners' sugar");
    });

    it("strips ', for greasing the pan' from name", () => {
      const result = parseIngredient("butter, for greasing the pan");
      expect(result.quantity).toBe(0);
      expect(result.name).toBe("butter");
    });

    it("strips ', for garnish' from name", () => {
      const result = parseIngredient("fresh parsley, for garnish");
      expect(result.name).toBe("fresh parsley");
    });

    it("strips ', to taste' from name", () => {
      const result = parseIngredient("salt, to taste");
      expect(result.quantity).toBe(0);
      expect(result.name).toBe("salt");
    });

    it("strips ', to taste' even with a unit: '1 pinch salt, to taste'", () => {
      const result = parseIngredient("1 pinch salt, to taste");
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe("pinch");
      expect(result.name).toBe("salt");
    });

    it("strips ', as needed' from name", () => {
      const result = parseIngredient("oil, as needed");
      expect(result.name).toBe("oil");
    });

    it("strips ', as required' from name", () => {
      const result = parseIngredient("water, as required");
      expect(result.name).toBe("water");
    });

    it("strips ', optional' from name", () => {
      const result = parseIngredient("red pepper flakes, optional");
      expect(result.name).toBe("red pepper flakes");
    });

    it("does not strip when there is no comma before purpose", () => {
      const result = parseIngredient("sauce for pasta");
      expect(result.name).toBe("sauce for pasta");
    });

    it("does not strip when there is no comma before the prep word", () => {
      const result = parseIngredient("blanched almonds");
      expect(result.name).toBe("blanched almonds");
    });
  });

  describe("preparation-state qualifier stripping", () => {
    it("strips ', peeled' from name", () => {
      expect(parseIngredient("russet potatoes, peeled").name).toBe("russet potatoes");
    });

    it("strips prep qualifier following parenthetical: 'potatoes (about 5), peeled'", () => {
      expect(parseIngredient("russet potatoes (about 5), peeled").name).toBe("russet potatoes (about 5)");
    });

    it("strips ', softened' from name", () => {
      expect(parseIngredient("unsalted butter, softened").name).toBe("unsalted butter");
    });

    it("strips ', melted' from name", () => {
      expect(parseIngredient("dark chocolate, melted").name).toBe("dark chocolate");
    });

    it("strips ', separated' from name", () => {
      expect(parseIngredient("large eggs, separated").name).toBe("large eggs");
    });

    it("strips ', zested' from name", () => {
      expect(parseIngredient("lemon, zested").name).toBe("lemon");
    });

    it("strips ', finely chopped' (adverb + prep word) from name", () => {
      expect(parseIngredient("flat-leaf parsley, finely chopped").name).toBe("flat-leaf parsley");
    });

    it("strips ', minced' from name", () => {
      expect(parseIngredient("garlic, minced").name).toBe("garlic");
    });

    it("strips ', drained' from name", () => {
      expect(parseIngredient("canned chickpeas, drained").name).toBe("canned chickpeas");
    });

    it("strips ', at room temperature' from name", () => {
      expect(parseIngredient("cream cheese, at room temperature").name).toBe("cream cheese");
    });

    it("strips ', room temperature' from name", () => {
      expect(parseIngredient("eggs, room temperature").name).toBe("eggs");
    });

    it("strips ', melted, or use vegetable oil' (prep word + more text) from name", () => {
      expect(parseIngredient("chicken fat, melted, or use vegetable oil").name).toBe("chicken fat");
    });

    it("strips ', sifted' from name", () => {
      expect(parseIngredient("2 cups flour, sifted").name).toBe("flour");
    });

    it("does not strip prep word when no comma precedes it", () => {
      expect(parseIngredient("blanched almonds").name).toBe("blanched almonds");
    });
  });

  describe("alternate quantity+unit expressions (dual-unit formats)", () => {
    it("strips slash-separated alternate: '8 ounces/227 grams blanched almonds'", () => {
      const result = parseIngredient("8 ounces/227 grams blanched almonds");
      expect(result.quantity).toBe(8);
      expect(result.unit).toBe("ounces");
      expect(result.name).toBe("blanched almonds");
    });

    it("strips slash-separated alternate without space: '1 cup/240ml milk'", () => {
      const result = parseIngredient("1 cup/240ml milk");
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe("cup");
      expect(result.name).toBe("milk");
    });

    it("strips slash-separated alternate metric-first: '200g/7oz dark chocolate'", () => {
      const result = parseIngredient("200g/7oz dark chocolate");
      expect(result.quantity).toBe(200);
      expect(result.unit).toBe("g");
      expect(result.name).toBe("dark chocolate");
    });

    it("strips 'or'-separated alternate: '2 tablespoons or 30ml olive oil'", () => {
      const result = parseIngredient("2 tablespoons or 30ml olive oil");
      expect(result.quantity).toBe(2);
      expect(result.unit).toBe("tablespoons");
      expect(result.name).toBe("olive oil");
    });

    it("strips parenthetical alternate: '8 oz (227g) blanched almonds'", () => {
      const result = parseIngredient("8 oz (227g) blanched almonds");
      expect(result.quantity).toBe(8);
      expect(result.unit).toBe("oz");
      expect(result.name).toBe("blanched almonds");
    });

    it("strips parenthetical alternate with space: '1 cup (240 ml) cream'", () => {
      const result = parseIngredient("1 cup (240 ml) cream");
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe("cup");
      expect(result.name).toBe("cream");
    });

    it("does not strip slash when it is a fraction in the quantity: '1/2 cup sugar'", () => {
      const result = parseIngredient("1/2 cup sugar");
      expect(result.quantity).toBeCloseTo(0.5);
      expect(result.unit).toBe("cup");
      expect(result.name).toBe("sugar");
    });

    it("does not strip when alternate is absent: '3 cups flour'", () => {
      const result = parseIngredient("3 cups flour");
      expect(result.quantity).toBe(3);
      expect(result.unit).toBe("cups");
      expect(result.name).toBe("flour");
    });

    it("does not strip when slash is followed by a non-qty word: '1 cup flour/sugar mix'", () => {
      const result = parseIngredient("1 cup flour/sugar mix");
      expect(result.quantity).toBe(1);
      expect(result.unit).toBe("cup");
      expect(result.name).toBe("flour/sugar mix");
    });

    it("handles decimal quantity with slash alternate: '1.5 cups/360ml buttermilk'", () => {
      const result = parseIngredient("1.5 cups/360ml buttermilk");
      expect(result.quantity).toBe(1.5);
      expect(result.unit).toBe("cups");
      expect(result.name).toBe("buttermilk");
    });

    it("handles fractional quantity with slash alternate: '1/4 cup/60ml lemon juice'", () => {
      const result = parseIngredient("1/4 cup/60ml lemon juice");
      expect(result.quantity).toBeCloseTo(0.25);
      expect(result.unit).toBe("cup");
      expect(result.name).toBe("lemon juice");
    });
  });
});
