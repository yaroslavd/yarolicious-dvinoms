import { describe, it, expect } from "vitest";
import { scaleIngredient, parseServingsCount } from "./scale-ingredient";

describe("scaleIngredient", () => {
  describe("basic scaling", () => {
    it("scales a whole-number unitless ingredient (Math.ceil)", () => {
      expect(scaleIngredient("3 bananas", 2)).toBe("6 bananas");
    });

    it("scales a measured ingredient with a fractional result", () => {
      expect(scaleIngredient("2 cups flour", 1.5)).toBe("3 cups flour");
    });

    it("rounds unitless ingredients up with Math.ceil", () => {
      expect(scaleIngredient("3 eggs", 1.5)).toBe("5 eggs");
    });

    it("allows fractional results for measured ingredients", () => {
      expect(scaleIngredient("1 cup milk", 1.5)).toBe("1.5 cup milk");
    });

    it("returns raw string unchanged when scaleFactor is 1", () => {
      expect(scaleIngredient("2 cups flour", 1)).toBe("2 cups flour");
    });

    it("returns raw string unchanged when no quantity is found", () => {
      expect(scaleIngredient("salt and pepper", 2)).toBe("salt and pepper");
    });

    it("scales a decimal quantity", () => {
      expect(scaleIngredient("1.5 cups buttermilk", 2)).toBe(
        "3 cups buttermilk",
      );
    });

    it("scales a unicode fraction quantity (½)", () => {
      expect(scaleIngredient("½ tsp salt", 2)).toBe("1 tsp salt");
    });

    it("scales a slash fraction quantity (1/2)", () => {
      expect(scaleIngredient("1/2 cup butter", 2)).toBe("1 cup butter");
    });

    it("scales a mixed fraction quantity (1 1/2)", () => {
      const result = scaleIngredient("1 1/2 cups milk", 2);
      expect(result).toBe("3 cups milk");
    });

    it("scales a range quantity (uses average)", () => {
      const result = scaleIngredient("2-3 stalks celery", 2);
      expect(result).toBe("5 stalks celery");
    });

    it("preserves multi-word ingredient names", () => {
      expect(scaleIngredient("2 cups all-purpose flour", 2)).toBe(
        "4 cups all-purpose flour",
      );
    });

    it("rounds measured results to 2 decimal places", () => {
      expect(scaleIngredient("1 cup sugar", 1.333)).toBe("1.33 cup sugar");
    });
  });

  describe("alternate quantity+unit expressions (dual-unit formats)", () => {
    it("strips slash alternate and scales primary: '8 ounces/227 grams blanched almonds' ×2", () => {
      expect(scaleIngredient("8 ounces/227 grams blanched almonds", 2)).toBe(
        "16 ounces blanched almonds",
      );
    });

    it("strips slash alternate without space: '1 cup/240ml milk' ×2", () => {
      expect(scaleIngredient("1 cup/240ml milk", 2)).toBe("2 cup milk");
    });

    it("strips slash alternate metric-first: '200g/7oz dark chocolate' ×2", () => {
      expect(scaleIngredient("200g/7oz dark chocolate", 2)).toBe(
        "400 g dark chocolate",
      );
    });

    it("strips 'or' alternate: '2 tablespoons or 30ml olive oil' ×3", () => {
      expect(scaleIngredient("2 tablespoons or 30ml olive oil", 3)).toBe(
        "6 tablespoons olive oil",
      );
    });

    it("strips parenthetical alternate: '8 oz (227g) blanched almonds' ×2", () => {
      expect(scaleIngredient("8 oz (227g) blanched almonds", 2)).toBe(
        "16 oz blanched almonds",
      );
    });

    it("strips parenthetical alternate with space: '1 cup (240 ml) cream' ×2", () => {
      expect(scaleIngredient("1 cup (240 ml) cream", 2)).toBe("2 cup cream");
    });

    it("does not misinterpret fraction as alternate: '1/2 cup/120ml lemon juice' ×2", () => {
      const result = scaleIngredient("1/2 cup/120ml lemon juice", 2);
      expect(result).toBe("1 cup lemon juice");
    });

    it("does not strip when slash is not followed by qty+unit: '1 cup flour/sugar mix' ×2", () => {
      expect(scaleIngredient("1 cup flour/sugar mix", 2)).toBe(
        "2 cup flour/sugar mix",
      );
    });
  });

  describe("purpose qualifier stripping", () => {
    it("strips ', for dusting' when scaling a measured ingredient", () => {
      expect(scaleIngredient("1 tbsp butter, for greasing", 2)).toBe(
        "2 tbsp butter",
      );
    });

    it("strips ', to taste' when scaling a measured ingredient", () => {
      expect(scaleIngredient("1 pinch salt, to taste", 2)).toBe("2 pinch salt");
    });

    it("strips ', as needed' when scaling a measured ingredient", () => {
      expect(scaleIngredient("2 tbsp oil, as needed", 2)).toBe("4 tbsp oil");
    });

    it("returns raw string unchanged for no-quantity ingredient with purpose qualifier", () => {
      expect(scaleIngredient("Confectioners' sugar, for dusting", 2)).toBe(
        "Confectioners' sugar, for dusting",
      );
    });

    it("does not strip purpose when no comma precedes it", () => {
      expect(scaleIngredient("2 cups sauce for pasta", 2)).toBe(
        "4 cups sauce for pasta",
      );
    });
  });

  describe("preparation-state qualifier stripping", () => {
    it("strips ', peeled' when scaling", () => {
      expect(scaleIngredient("3 russet potatoes, peeled", 2)).toBe(
        "6 russet potatoes",
      );
    });

    it("strips ', softened' when scaling", () => {
      expect(scaleIngredient("2 tbsp butter, softened", 2)).toBe(
        "4 tbsp butter",
      );
    });

    it("strips ', melted' when scaling", () => {
      expect(scaleIngredient("100g dark chocolate, melted", 1.5)).toBe(
        "150 g dark chocolate",
      );
    });

    it("strips ', separated' when scaling", () => {
      expect(scaleIngredient("4 large eggs, separated", 0.5)).toBe(
        "2 large eggs",
      );
    });

    it("strips ', finely chopped' (adverb + prep word) when scaling", () => {
      expect(scaleIngredient("2 cloves garlic, finely chopped", 2)).toBe(
        "4 cloves garlic",
      );
    });

    it("strips ', sifted' when scaling", () => {
      expect(scaleIngredient("2 cups flour, sifted", 2)).toBe("4 cups flour");
    });

    it("does not strip prep word when no comma precedes it", () => {
      expect(scaleIngredient("4 oz blanched almonds", 2)).toBe(
        "8 oz blanched almonds",
      );
    });
  });

  describe("unit detection edge cases", () => {
    it("treats 'large eggs' as unitless and applies Math.ceil", () => {
      expect(scaleIngredient("2 large eggs", 1.5)).toBe("3 large eggs");
    });

    it("recognizes multi-word unit 'fl oz'", () => {
      expect(scaleIngredient("4 fl oz lemon juice", 2)).toBe(
        "8 fl oz lemon juice",
      );
    });

    it("strips 'of' between unit and name", () => {
      expect(scaleIngredient("1 cup of sugar", 2)).toBe("2 cup sugar");
    });
  });
});

describe("parseServingsCount", () => {
  it("extracts a whole number from '4 servings'", () => {
    expect(parseServingsCount("4 servings")).toBe(4);
  });

  it("extracts a number from 'Makes 6'", () => {
    expect(parseServingsCount("Makes 6")).toBe(6);
  });

  it("extracts a decimal from '2.5 servings'", () => {
    expect(parseServingsCount("2.5 servings")).toBe(2.5);
  });

  it("returns 1 for null", () => {
    expect(parseServingsCount(null)).toBe(1);
  });

  it("returns 1 for empty string", () => {
    expect(parseServingsCount("")).toBe(1);
  });

  it("returns 1 when no number found", () => {
    expect(parseServingsCount("several")).toBe(1);
  });
});
