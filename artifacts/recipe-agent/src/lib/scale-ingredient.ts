const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
  "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8,
  "⅙": 1 / 6, "⅚": 5 / 6,
};

function parseFraction(s: string): number | null {
  s = s.trim();
  if (!s) return null;
  for (const [char, val] of Object.entries(UNICODE_FRACTIONS)) {
    if (s === char) return val;
  }
  const unicodeMixed = s.match(/^(\d+)\s*([½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚])$/);
  if (unicodeMixed) {
    return parseInt(unicodeMixed[1], 10) + (UNICODE_FRACTIONS[unicodeMixed[2]] ?? 0);
  }
  const slashFrac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slashFrac) {
    const den = parseInt(slashFrac[2], 10);
    if (den === 0) return null;
    return parseInt(slashFrac[1], 10) / den;
  }
  const mixedFrac = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixedFrac) {
    const den = parseInt(mixedFrac[3], 10);
    if (den === 0) return null;
    return parseInt(mixedFrac[1], 10) + parseInt(mixedFrac[2], 10) / den;
  }
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
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

const UNIT_REGEX = new RegExp(`^(${UNITS.join("|")})\\b`, "i");

const unicodeFracChars = Object.keys(UNICODE_FRACTIONS).join("");
const NUM_PATTERN = `(?:\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d+(?:\\.\\d+)?|[${unicodeFracChars}]|\\d+\\s*[${unicodeFracChars}])`;
const QUANTITY_REGEX = new RegExp(
  `^(${NUM_PATTERN})(?:\\s*[-–]\\s*(${NUM_PATTERN}))?\\s*`,
  "u"
);

function parseQuantity(raw: string): { qty: number; rest: string } | null {
  const m = raw.match(QUANTITY_REGEX);
  if (!m) return null;
  const q1 = parseFraction(m[1]);
  if (q1 === null) return null;
  let qty = q1;
  if (m[2]) {
    const q2 = parseFraction(m[2]);
    if (q2 !== null) qty = (q1 + q2) / 2;
  }
  return { qty, rest: raw.slice(m[0].length) };
}

/** Strip cooking-purpose and preparation-state qualifiers after a comma. */
const QUALIFIER_REGEX =
  /,\s*(?:for\b|to\b|as\s+(?:needed|required)|optional\b|(?:at\s+)?room\s+temperature\b|(?:(?:very|lightly|finely|roughly|coarsely|thinly|freshly|well|loosely|barely|evenly)\s+)*(?:peeled|softened|melted|separated|zested|chopped|diced|minced|sliced|crushed|grated|trimmed|thawed|frozen|drained|rinsed|toasted|roasted|blanched|cooked|beaten|sifted|packed|halved|quartered|shredded|cubed|crumbled|mashed|pureed|blended|ground|pitted|seeded|deveined|browned|caramelized|cooled|warmed|chilled|stemmed|dried|soaked|torn|flaked|whipped|whisked|boiled|steamed|smoked|pickled|aged|juiced|skinned|butterflied|cold|warm)\b).*$/i;

function stripQualifiers(s: string): string {
  return s.replace(QUALIFIER_REGEX, "").trim();
}

interface ParsedLine {
  qty: number;
  unit: string;
  name: string;
}

function parseLine(raw: string): ParsedLine | null {
  const parsed = parseQuantity(raw);
  if (!parsed) return null;

  const { qty, rest } = parsed;
  const trimmed = rest.trimStart();

  const uMatch = trimmed.match(UNIT_REGEX);
  if (!uMatch) {
    return { qty, unit: "", name: stripQualifiers(trimmed) };
  }

  const unit = uMatch[0];
  let afterUnit = trimmed.slice(uMatch[0].length).trim();

  // Strip optional alternate quantity+unit expressions:
  //   "8 ounces/227 grams ..."   → slash-separated alternate
  //   "8 oz or 227g ..."         → "or"-separated alternate
  //   "8 oz (227g) ..."          → parenthetical alternate
  const altPrefixMatch = afterUnit.match(/^(?:\/\s*|\bor\s+|\(\s*)/i);
  if (altPrefixMatch) {
    const inParens = altPrefixMatch[0].trimStart().startsWith("(");
    const afterPrefix = afterUnit.slice(altPrefixMatch[0].length);
    const altParsed = parseQuantity(afterPrefix);
    if (altParsed) {
      const altTrimmed = altParsed.rest.trimStart();
      const altUMatch = altTrimmed.match(UNIT_REGEX);
      if (altUMatch) {
        afterUnit = altTrimmed.slice(altUMatch[0].length).trim();
        if (inParens && afterUnit.startsWith(")")) afterUnit = afterUnit.slice(1).trim();
      }
    }
  }

  // Strip "of" / comma connectors between unit and ingredient name
  const commaOrOf = afterUnit.match(/^(?:,\s*|of\s+)/i);
  if (commaOrOf) afterUnit = afterUnit.slice(commaOrOf[0].length);

  const name = stripQualifiers(afterUnit);

  return { qty, unit, name };
}

export function scaleIngredient(raw: string, scaleFactor: number): string {
  raw = raw.trim();
  if (scaleFactor === 1) return raw;

  const parsed = parseLine(raw);
  if (!parsed) return raw;

  const { qty: baseQty, unit, name } = parsed;
  const scaled = baseQty * scaleFactor;

  const hasUnit = unit !== "";
  const finalQty = hasUnit
    ? parseFloat(scaled.toFixed(2))
    : Math.ceil(scaled);

  const parts = [String(finalQty), unit, name].filter(Boolean);
  return parts.join(" ");
}

export function parseServingsCount(servingsStr: string | null | undefined): number {
  if (!servingsStr) return 1;
  const match = servingsStr.match(/(\d+(?:\.\d+)?)/);
  if (!match) return 1;
  const n = parseFloat(match[1]);
  return isNaN(n) || n <= 0 ? 1 : n;
}
