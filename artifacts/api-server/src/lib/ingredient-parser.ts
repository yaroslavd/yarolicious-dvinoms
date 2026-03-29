const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
};

function parseFraction(s: string): number | null {
  s = s.trim();
  if (!s) return null;

  for (const [char, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (s === char) return val;
  }

  const unicodeMixed = s.match(/^(\d+)\s*([½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚])$/);
  if (unicodeMixed) {
    const whole = parseInt(unicodeMixed[1], 10);
    const frac = UNICODE_FRACTIONS[unicodeMixed[2]] ?? 0;
    return whole + frac;
  }

  const slashFraction = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slashFraction) {
    const num = parseInt(slashFraction[1], 10);
    const den = parseInt(slashFraction[2], 10);
    if (den === 0) return null;
    return num / den;
  }

  const mixedFraction = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedFraction) {
    const whole = parseInt(mixedFraction[1], 10);
    const num = parseInt(mixedFraction[2], 10);
    const den = parseInt(mixedFraction[3], 10);
    if (den === 0) return null;
    return whole + num / den;
  }

  const num = parseFloat(s);
  if (!isNaN(num)) return num;

  return null;
}

const UNITS = [
  "teaspoons?", "tsps?",
  "tablespoons?", "tbsps?", "tbs",
  "cups?",
  "fluid ounces?", "fl\\.?\\s*oz\\.?",
  "ounces?", "oz\\.?",
  "pounds?", "lbs?\\.?",
  "grams?", "g",
  "kilograms?", "kg",
  "milliliters?", "ml",
  "liters?", "l",
  "pints?", "pts?\\.?",
  "quarts?", "qts?\\.?",
  "gallons?", "gal",
  "pieces?",
  "slices?",
  "cloves?",
  "stalks?",
  "bunches?",
  "heads?",
  "cans?",
  "jars?",
  "packages?", "pkgs?\\.?",
  "sprigs?",
  "leaves?", "leaf",
  "strips?",
  "sheets?",
  "pinches?",
  "dashes?",
  "drops?",
  "handfuls?",
  "servings?",
  "bags?",
  "blocks?",
  "boxes?",
  "bottles?",
  "links?",
  "fillets?",
  "breasts?",
  "thighs?",
  "legs?",
  "loaves?",
  "rounds?",
];

const UNIT_REGEX = new RegExp(
  `^(${UNITS.join("|")})\\b`,
  "i"
);

export interface ParsedIngredient {
  quantity: number;
  unit: string;
  name: string;
}

export function parseIngredient(raw: string): ParsedIngredient {
  raw = raw.trim();

  const quantityParts: string[] = [];

  const unicodeFracPattern = `[${Object.keys(UNICODE_FRACTIONS).join("")}]`;
  const mixedNum = `\\d+\\s*(?:\\d+\\s*/\\s*\\d+|${unicodeFracPattern})`;
  const simpleFrac = `\\d+\\s*/\\s*\\d+`;
  const decimalNum = `\\d+(?:\\.\\d+)?`;
  const numPattern = `(?:${mixedNum}|${simpleFrac}|${decimalNum}|${unicodeFracPattern})`;

  const quantityRegex = new RegExp(
    `^(${numPattern})(?:\\s*-\\s*(${numPattern}))?\\s*`,
    "u"
  );

  let rest = raw;
  let quantity = 1;

  const qMatch = rest.match(quantityRegex);
  if (qMatch) {
    const q1 = parseFraction(qMatch[1]);
    if (q1 !== null) {
      quantity = q1;
      if (qMatch[2]) {
        const q2 = parseFraction(qMatch[2]);
        if (q2 !== null) {
          quantity = (q1 + q2) / 2;
        }
      }
      rest = rest.slice(qMatch[0].length);
    }
  }

  let unit = "";
  const uMatch = rest.match(UNIT_REGEX);
  if (uMatch) {
    unit = uMatch[0].trim().toLowerCase();
    rest = rest.slice(uMatch[0].length).trim();

    const commaOrOf = rest.match(/^(?:,\s*|of\s+)/i);
    if (commaOrOf) {
      rest = rest.slice(commaOrOf[0].length);
    }
  }

  const name = rest.trim() || raw.trim();

  return { quantity, unit, name };
}
