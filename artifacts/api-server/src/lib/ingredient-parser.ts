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
  "bunch(?:es)?",
  "heads?",
  "cans?",
  "jars?",
  "packages?", "pkgs?\\.?",
  "sprigs?",
  "leaves?", "leaf",
  "strips?",
  "sheets?",
  "pinch(?:es)?",
  "dash(?:es)?",
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
  let quantity = 0;

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

    // Strip optional alternate quantity+unit expressions such as:
    //   "8 ounces/227 grams ..."   → slash-separated alternate
    //   "8 oz or 227g ..."         → "or"-separated alternate
    //   "8 oz (227g) ..."          → parenthetical alternate
    const altPrefixMatch = rest.match(/^(?:\/\s*|\bor\s+|\(\s*)/i);
    if (altPrefixMatch) {
      const inParens = altPrefixMatch[0].trimStart().startsWith("(");
      const afterPrefix = rest.slice(altPrefixMatch[0].length);
      const altQMatch = afterPrefix.match(quantityRegex);
      if (altQMatch && parseFraction(altQMatch[1]) !== null) {
        const afterAltQty = afterPrefix.slice(altQMatch[0].length);
        const altUMatch = afterAltQty.match(UNIT_REGEX);
        if (altUMatch) {
          rest = afterAltQty.slice(altUMatch[0].length).trim();
          if (inParens && rest.startsWith(")")) rest = rest.slice(1).trim();
        }
      }
    }

    const commaOrOf = rest.match(/^(?:,\s*|of\s+)/i);
    if (commaOrOf) {
      rest = rest.slice(commaOrOf[0].length);
    }
  }

  let name = rest.trim() || raw.trim();

  // Strip cooking-purpose qualifiers (", for dusting", ", to taste", etc.) and
  // preparation-state qualifiers that don't belong on a shopping list
  // (", peeled", ", softened", ", finely chopped", ", at room temperature", etc.)
  name = name.replace(
    /,\s*(?:for\b|to\b|as\s+(?:needed|required)|optional\b|(?:at\s+)?room\s+temperature\b|(?:(?:very|lightly|finely|roughly|coarsely|thinly|freshly|well|loosely|barely|evenly)\s+)*(?:peeled|softened|melted|separated|zested|chopped|diced|minced|sliced|crushed|grated|trimmed|thawed|frozen|drained|rinsed|toasted|roasted|blanched|cooked|beaten|sifted|packed|halved|quartered|shredded|cubed|crumbled|mashed|pureed|blended|ground|pitted|seeded|deveined|browned|caramelized|cooled|warmed|chilled|stemmed|dried|soaked|torn|flaked|whipped|whisked|boiled|steamed|smoked|pickled|aged|juiced|skinned|butterflied|cold|warm)\b).*$/i,
    ""
  ).trim();

  return { quantity, unit, name };
}
