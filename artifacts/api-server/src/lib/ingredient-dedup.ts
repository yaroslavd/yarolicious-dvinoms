/**
 * Ingredient deduplication helpers.
 *
 * Goals:
 * - "banana" and "bananas"  → same ingredient (plural normalization)
 * - "whole milk" and "oat milk" → different ingredients
 * - "32 fl oz" and "4 cups" → same unit family (volume), can aggregate
 * - volume ≠ weight (can't merge "1 cup flour" with "100 g flour")
 */

// ---------------------------------------------------------------------------
// Unit normalization
// ---------------------------------------------------------------------------

const VOLUME_ALIASES: Record<string, string> = {
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp", t: "tsp",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp", tbs: "tbsp", tb: "tbsp",
  "fluid ounce": "fl oz", "fluid ounces": "fl oz", "fl oz": "fl oz", "fl. oz": "fl oz", "fl. oz.": "fl oz", "floz": "fl oz",
  cup: "cup", cups: "cup", c: "cup",
  pint: "pint", pints: "pint", pt: "pint", pts: "pint",
  quart: "quart", quarts: "quart", qt: "quart", qts: "quart",
  gallon: "gallon", gallons: "gallon", gal: "gallon",
  milliliter: "ml", milliliters: "ml", ml: "ml", millilitre: "ml", millilitres: "ml",
  liter: "l", liters: "l", litre: "l", litres: "l", l: "l",
};

const WEIGHT_ALIASES: Record<string, string> = {
  ounce: "oz", ounces: "oz", oz: "oz",
  pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",
  gram: "g", grams: "g", g: "g",
  kilogram: "kg", kilograms: "kg", kg: "kg",
};

/** Convert any unit string to a canonical lowercase identifier, or return the original. */
export function normalizeUnit(raw: string): string {
  const key = raw.toLowerCase().trim().replace(/\.+$/, "");
  return VOLUME_ALIASES[key] ?? WEIGHT_ALIASES[key] ?? key;
}

// ---------------------------------------------------------------------------
// Unit conversion: everything converted to a common base within its family
// ---------------------------------------------------------------------------

/** ml per unit (volume) */
const VOLUME_TO_ML: Record<string, number> = {
  tsp:    4.92892,
  tbsp:   14.7868,
  "fl oz": 29.5735,
  cup:    236.588,
  pint:   473.176,
  quart:  946.353,
  gallon: 3785.41,
  ml:     1,
  l:      1000,
};

/** grams per unit (weight) */
const WEIGHT_TO_G: Record<string, number> = {
  oz: 28.3495,
  lb: 453.592,
  g:  1,
  kg: 1000,
};

/** "Nice" display unit: given a volume in ml, pick the most readable unit. */
function bestVolumeUnit(ml: number): string {
  if (ml >= VOLUME_TO_ML.gallon) return "gallon";
  if (ml >= VOLUME_TO_ML.quart) return "quart";
  if (ml >= VOLUME_TO_ML.pint) return "pint";
  if (ml >= VOLUME_TO_ML.cup) return "cup";
  if (ml >= VOLUME_TO_ML["fl oz"]) return "fl oz";
  if (ml >= VOLUME_TO_ML.tbsp) return "tbsp";
  return "tsp";
}

/** "Nice" display unit: given a weight in grams, pick the most readable unit. */
function bestWeightUnit(g: number): string {
  if (g >= WEIGHT_TO_G.kg) return "kg";
  if (g >= WEIGHT_TO_G.lb) return "lb";
  if (g >= WEIGHT_TO_G.oz) return "oz";
  return "g";
}

/**
 * Add two quantity+unit pairs and return the merged result.
 * Returns null if the units are incompatible (different families or unknown).
 * When units are the same (or both empty), no conversion is needed.
 */
export function mergeQuantities(
  existingQty: number,
  existingUnit: string,
  incomingQty: number,
  incomingUnit: string
): { quantity: number; unit: string } | null {
  const eu = normalizeUnit(existingUnit);
  const iu = normalizeUnit(incomingUnit);

  // Same unit (including both empty = count-based items like "3 bananas")
  if (eu === iu) {
    return { quantity: existingQty + incomingQty, unit: eu };
  }

  // Both volume?
  if (VOLUME_TO_ML[eu] !== undefined && VOLUME_TO_ML[iu] !== undefined) {
    const totalMl = existingQty * VOLUME_TO_ML[eu] + incomingQty * VOLUME_TO_ML[iu];
    const targetUnit = bestVolumeUnit(totalMl);
    return {
      quantity: totalMl / VOLUME_TO_ML[targetUnit],
      unit: targetUnit,
    };
  }

  // Both weight?
  if (WEIGHT_TO_G[eu] !== undefined && WEIGHT_TO_G[iu] !== undefined) {
    const totalG = existingQty * WEIGHT_TO_G[eu] + incomingQty * WEIGHT_TO_G[iu];
    const targetUnit = bestWeightUnit(totalG);
    return {
      quantity: totalG / WEIGHT_TO_G[targetUnit],
      unit: targetUnit,
    };
  }

  // Incompatible units (e.g., volume vs weight, or one is a count) — cannot merge
  return null;
}

// ---------------------------------------------------------------------------
// Name normalization (handle common plurals)
// ---------------------------------------------------------------------------

/** Words that naturally end in 's' and should NOT have the s stripped. */
const S_ENDINGS_EXCEPTIONS = new Set([
  "asparagus", "hummus", "couscous", "molasses", "lentils", "oats",
  "sprouts", "grits", "chips", "nuts", "clams", "mussels", "shrimp",
  "scallops", "anchovies", "sardines", "capers", "herbs", "dates",
  "figs", "beets", "greens", "leeks", "chives", "raisins", "grapes",
  "fries", "berries", "cherries", "plums", "olives", "seeds",
  "grains", "flakes", "crumbs", "beans", "peas", "rolls",
]);

/**
 * Normalize an ingredient name for deduplication purposes.
 * Returns a lowercase canonical form — NOT for display, only for comparison.
 *
 * Rules (order matters):
 *  1. ies → y  (raspberries → raspberry, blueberries → blueberry)
 *  2. ves → f  (leaves → leaf, loaves → loaf)
 *  3. es  → e  if the word ends in -oes / -shes / -xes, etc.
 *  4. s   → strip if word > 4 chars and not in exceptions list
 */
export function normalizeName(raw: string): string {
  const lower = raw.toLowerCase().trim();

  // Multi-word: apply singularization to each word, then rejoin
  const words = lower.split(/\s+/);
  const normalized = words.map((word) => singularize(word));
  return normalized.join(" ");
}

function singularize(word: string): string {
  if (word.length <= 3) return word;

  // ies → y  (raspberries → raspberry)
  if (word.endsWith("ies") && word.length > 4) {
    return word.slice(0, -3) + "y";
  }

  // ves → f  (leaves → leaf, loaves → loaf)
  if (word.endsWith("ves") && word.length > 4) {
    return word.slice(0, -3) + "f";
  }

  // oes → o  (tomatoes → tomato, potatoes → potato)
  if (word.endsWith("oes") && word.length > 4) {
    return word.slice(0, -2); // "tomatoes" → "tomato"
  }

  // ses, xes, zes, ches, shes → strip "es"  (dishes → dish)
  if (
    word.endsWith("ses") ||
    word.endsWith("xes") ||
    word.endsWith("zes") ||
    word.endsWith("ches") ||
    word.endsWith("shes")
  ) {
    return word.slice(0, -2);
  }

  // Strip trailing 's' for non-exception words of sufficient length
  if (
    word.endsWith("s") &&
    word.length > 4 &&
    !S_ENDINGS_EXCEPTIONS.has(word)
  ) {
    return word.slice(0, -1);
  }

  return word;
}

/**
 * Find the best-matching existing cart item for the incoming ingredient.
 *
 * Matching logic:
 *  1. Exact name match (case-insensitive) + same unit family
 *  2. Normalized name match (plural-collapsed) + same unit family
 *
 * Returns null if no match found (item should be added as new entry).
 */
export interface CartItemLike {
  id: number;
  name: string;
  quantity: string;
  unit: string;
}

export function findMatchingItem(
  candidates: CartItemLike[],
  incomingName: string,
  incomingUnit: string
): CartItemLike | null {
  const iNameExact = incomingName.toLowerCase().trim();
  const iNameNorm = normalizeName(incomingName);
  const iUnit = normalizeUnit(incomingUnit);

  for (const candidate of candidates) {
    const cNameExact = candidate.name.toLowerCase().trim();
    const cNameNorm = normalizeName(candidate.name);
    const cUnit = normalizeUnit(candidate.unit);

    const nameMatches = cNameExact === iNameExact || cNameNorm === iNameNorm;
    if (!nameMatches) continue;

    // Check unit compatibility (same unit or same family)
    const merged = mergeQuantities(
      parseFloat(candidate.quantity),
      candidate.unit,
      1, // dummy quantity — we just need to check compatibility
      incomingUnit
    );
    if (merged !== null) return candidate;
  }

  return null;
}
