import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, shoppingCartItemsTable } from "@workspace/db";
import { parseIngredient } from "../lib/ingredient-parser";
import { categorizeIngredient } from "../lib/aisle-categorizer";
import { generateIngredientThumbnail } from "../lib/thumbnail-generator";
import { findMatchingItem, mergeQuantities, normalizeUnit } from "../lib/ingredient-dedup";

/** Merge an incoming recipe name into an existing comma-separated source list. */
function mergeSourceRecipes(
  existing: string | null,
  incoming: string | null | undefined,
): string | null {
  const incomingName = incoming?.trim() || null;
  if (!incomingName) return existing;
  const existingList = existing ? existing.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (existingList.includes(incomingName)) return existing;
  return [...existingList, incomingName].sort().join(", ");
}

const router: IRouter = Router();

router.get("/cart", async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(shoppingCartItemsTable)
    .orderBy(shoppingCartItemsTable.aisle, shoppingCartItemsTable.name);
  res.json(items);
});

router.post("/cart/items", async (req, res): Promise<void> => {
  const body = req.body as { ingredients: string[]; sourceRecipe?: string };
  if (!Array.isArray(body.ingredients) || body.ingredients.length === 0) {
    res.status(400).json({ error: "ingredients must be a non-empty array" });
    return;
  }

  // Fetch existing items once; we'll mutate our local view as we process
  const existingItems = await db.select().from(shoppingCartItemsTable);
  // Working copy we update as we process so that intra-batch dedup also works
  const workingCart = [...existingItems];

  const savedItems = [];

  for (const raw of body.ingredients) {
    if (typeof raw !== "string" || !raw.trim()) continue;

    const parsed = parseIngredient(raw.trim());
    const { quantity, unit, name } = parsed;

    const match = findMatchingItem(workingCart, name, unit);

    if (match) {
      // Merge quantities with unit conversion
      const merged = mergeQuantities(
        parseFloat(match.quantity),
        match.unit,
        quantity,
        unit
      );

      if (merged) {
        // Round to avoid floating-point noise (max 6 decimal places)
        const roundedQty = parseFloat(merged.quantity.toFixed(6));
        const newSourceRecipe = mergeSourceRecipes(match.sourceRecipe, body.sourceRecipe);
        const [updated] = await db
          .update(shoppingCartItemsTable)
          .set({
            quantity: roundedQty.toString(),
            unit: normalizeUnit(merged.unit),
            sourceRecipe: newSourceRecipe,
          })
          .where(eq(shoppingCartItemsTable.id, match.id))
          .returning();
        savedItems.push(updated);

        // Keep working cart in sync
        const idx = workingCart.findIndex((i) => i.id === match.id);
        if (idx !== -1 && updated) {
          workingCart[idx] = updated;
        }
        continue;
      }
      // Incompatible units fall through to add as a new entry
    }

    // New ingredient — categorize and insert
    const aisle = await categorizeIngredient(name);
    const sourceRecipe = body.sourceRecipe?.trim() || null;
    const [newItem] = await db
      .insert(shoppingCartItemsTable)
      .values({
        name,
        quantity: quantity.toString(),
        unit: normalizeUnit(unit),
        aisle,
        checked: false,
        thumbnailUrl: null,
        sourceRecipe,
      })
      .returning();

    savedItems.push(newItem);
    if (newItem) workingCart.push(newItem);

    // Generate thumbnail asynchronously
    generateIngredientThumbnail(name)
      .then(async (url) => {
        if (url && newItem?.id) {
          await db
            .update(shoppingCartItemsTable)
            .set({ thumbnailUrl: url })
            .where(eq(shoppingCartItemsTable.id, newItem.id));
        }
      })
      .catch(() => {});
  }

  res.status(201).json(savedItems);
});

router.patch("/cart/items/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const body = req.body as { quantity?: unknown; unit?: unknown };
  const quantity = typeof body.quantity === "number" ? body.quantity : parseFloat(String(body.quantity));
  const unit = typeof body.unit === "string" ? body.unit.trim() : null;

  if (isNaN(quantity) || quantity <= 0) {
    res.status(400).json({ error: "quantity must be a positive number" });
    return;
  }
  if (unit === null) {
    res.status(400).json({ error: "unit is required (use empty string for count-based items)" });
    return;
  }

  const [existing] = await db
    .select()
    .from(shoppingCartItemsTable)
    .where(eq(shoppingCartItemsTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const roundedQty = parseFloat(quantity.toFixed(6));
  const [updated] = await db
    .update(shoppingCartItemsTable)
    .set({ quantity: roundedQty.toString(), unit })
    .where(eq(shoppingCartItemsTable.id, id))
    .returning();

  res.json(updated);
});

router.patch("/cart/items/:id/toggle", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [item] = await db
    .select()
    .from(shoppingCartItemsTable)
    .where(eq(shoppingCartItemsTable.id, id));

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const [updated] = await db
    .update(shoppingCartItemsTable)
    .set({ checked: !item.checked })
    .where(eq(shoppingCartItemsTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/cart/items/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db
    .delete(shoppingCartItemsTable)
    .where(eq(shoppingCartItemsTable.id, id));

  res.status(204).send();
});

router.delete("/cart", async (req, res): Promise<void> => {
  const mode = (req.query.mode as string) ?? "all";

  if (mode !== "all" && mode !== "checked") {
    res.status(400).json({ error: "mode must be 'all' or 'checked'" });
    return;
  }

  if (mode === "checked") {
    await db
      .delete(shoppingCartItemsTable)
      .where(eq(shoppingCartItemsTable.checked, true));
  } else {
    await db.delete(shoppingCartItemsTable);
  }

  res.status(204).send();
});

export default router;

/**
 * Background startup task: find any cart items that have no thumbnail
 * (null or empty string) and regenerate them with the current prompt style.
 * Runs fire-and-forget; errors are logged but never fatal.
 */
export async function regenerateMissingThumbnails(): Promise<void> {
  const missing = await db
    .select()
    .from(shoppingCartItemsTable)
    .then((rows) => rows.filter((r) => !r.thumbnailUrl));

  if (missing.length === 0) return;

  console.log(`[cart] regenerating thumbnails for ${missing.length} item(s)…`);

  for (const item of missing) {
    generateIngredientThumbnail(item.name)
      .then(async (url) => {
        if (url && item.id) {
          await db
            .update(shoppingCartItemsTable)
            .set({ thumbnailUrl: url })
            .where(eq(shoppingCartItemsTable.id, item.id));
          console.log(`[cart] thumbnail ready for "${item.name}"`);
        }
      })
      .catch(() => {});
  }
}
