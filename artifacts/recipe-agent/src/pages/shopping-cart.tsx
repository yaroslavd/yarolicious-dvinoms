import { useState, useMemo, useEffect, useCallback } from "react";
import {
  ShoppingCart as CartIcon,
  Trash2,
  Check,
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  BookOpen,
} from "lucide-react";
import {
  useListCartItems,
  useAddCartItems,
  useDeleteCartItem,
  useToggleCartItem,
  useUpdateCartItem,
  useClearCart,
  getListCartItemsQueryKey,
} from "@workspace/api-client-react";
import type { CartItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";

// ---------------------------------------------------------------------------
// Unit conversion (mirrors backend logic, client-side for instant UI updates)
// ---------------------------------------------------------------------------

const VOLUME_TO_ML: Record<string, number> = {
  tsp: 4.92892,
  tbsp: 14.7868,
  "fl oz": 29.5735,
  cup: 236.588,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
};

const WEIGHT_TO_G: Record<string, number> = {
  oz: 28.3495,
  lb: 453.592,
  g: 1,
  kg: 1000,
};

function convertUnits(qty: number, from: string, to: string): number | null {
  if (from === to) return qty;
  if (VOLUME_TO_ML[from] !== undefined && VOLUME_TO_ML[to] !== undefined) {
    return (qty * VOLUME_TO_ML[from]) / VOLUME_TO_ML[to];
  }
  if (WEIGHT_TO_G[from] !== undefined && WEIGHT_TO_G[to] !== undefined) {
    return (qty * WEIGHT_TO_G[from]) / WEIGHT_TO_G[to];
  }
  return null;
}

/**
 * Neighboring US units to show in the switcher for a given unit.
 * Only 2–3 options, focused on common US usage.
 */
const UNIT_NEIGHBORS: Record<string, string[]> = {
  tsp: ["tsp", "tbsp"],
  tbsp: ["tsp", "tbsp", "cup"],
  "fl oz": ["fl oz", "cup"],
  cup: ["fl oz", "cup", "quart"],
  pint: ["cup", "pint", "quart"],
  quart: ["cup", "quart", "gallon"],
  gallon: ["quart", "gallon"],
  oz: ["oz", "lb"],
  lb: ["oz", "lb"],
  g: ["g", "kg"],
  kg: ["g", "kg"],
};

// ---------------------------------------------------------------------------
// Quantity display helpers
// ---------------------------------------------------------------------------

const FRACTION_SYMBOLS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];

function formatQty(qty: number): string {
  if (!isFinite(qty) || isNaN(qty)) return "?";
  const whole = Math.floor(qty);
  const frac = qty - whole;

  if (frac < 0.015 || frac > 0.985) return String(Math.round(qty));

  for (const [val, sym] of FRACTION_SYMBOLS) {
    if (Math.abs(frac - val) < 0.02) {
      return whole > 0 ? `${whole}${sym}` : sym;
    }
  }

  const rounded = parseFloat(qty.toFixed(2));
  return String(rounded);
}

// ---------------------------------------------------------------------------
// Aisle config
// ---------------------------------------------------------------------------

const AISLE_ORDER = [
  "Produce",
  "Dairy",
  "Meat & Seafood",
  "Bakery",
  "Frozen",
  "Canned Goods",
  "Condiments & Sauces",
  "Spices & Seasonings",
  "Dry Goods & Pasta",
  "Beverages",
  "Other",
];

const AISLE_ICONS: Record<string, string> = {
  Produce: "🥦",
  Dairy: "🥛",
  "Meat & Seafood": "🥩",
  Bakery: "🍞",
  Frozen: "🧊",
  "Canned Goods": "🥫",
  "Condiments & Sauces": "🫙",
  "Spices & Seasonings": "🌶️",
  "Dry Goods & Pasta": "🌾",
  Beverages: "🥤",
  Other: "🛒",
};

// ---------------------------------------------------------------------------
// CartItemRow
// ---------------------------------------------------------------------------

function CartItemRow({
  item,
  onToggle,
  onDelete,
  onUpdate,
  showSource,
}: {
  item: CartItem;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, quantity: number, unit: string) => void;
  showSource: boolean;
}) {
  const [imgError, setImgError] = useState(false);

  // Reset error state if a new thumbnail URL arrives (e.g. generated after load)
  useEffect(() => {
    setImgError(false);
  }, [item.thumbnailUrl]);

  // Local state for optimistic UI — synced from server on item prop change
  const [localQty, setLocalQty] = useState(() => parseFloat(item.quantity));
  const [localUnit, setLocalUnit] = useState(item.unit);

  // Inline editing
  const [isEditingQty, setIsEditingQty] = useState(false);
  const [editDraft, setEditDraft] = useState("");

  useEffect(() => {
    setLocalQty(parseFloat(item.quantity));
    setLocalUnit(item.unit);
  }, [item.quantity, item.unit]);

  // qty=0 with no unit means "unspecified" (e.g. "salt, to taste") — show no stepper
  const isUnspecified = localQty === 0 && !localUnit;

  // Use 0.1 steps for measured ingredients under 10; whole steps for discrete ones
  const step = localUnit && localQty < 10 ? 0.1 : 1;

  const commit = useCallback(
    (qty: number, unit: string) => {
      const minQty = unit ? 0.1 : 1;
      const clamped = Math.max(minQty, parseFloat(qty.toFixed(4)));
      onUpdate(item.id, clamped, unit);
    },
    [item.id, onUpdate],
  );

  const handleIncrease = () => {
    const next = parseFloat((localQty + step).toFixed(4));
    setLocalQty(next);
    commit(next, localUnit);
  };

  const handleDecrease = () => {
    const next = parseFloat((localQty - step).toFixed(4));
    if (next <= 0) return;
    setLocalQty(next);
    commit(next, localUnit);
  };

  const handleUnitSwitch = (newUnit: string) => {
    const converted = convertUnits(localQty, localUnit, newUnit);
    if (converted === null || !isFinite(converted)) return;
    const rounded = parseFloat(converted.toFixed(4));
    setLocalQty(rounded);
    setLocalUnit(newUnit);
    commit(rounded, newUnit);
  };

  const startEditing = () => {
    const display =
      localUnit && localQty < 10 ? localQty.toFixed(1) : formatQty(localQty);
    setEditDraft(display);
    setIsEditingQty(true);
  };

  const commitDraft = () => {
    setIsEditingQty(false);
    const parsed = parseFloat(editDraft.replace(/[^0-9.]/g, ""));
    if (!isFinite(parsed) || parsed <= 0) return;
    setLocalQty(parsed);
    commit(parsed, localUnit);
  };

  const neighbors = localUnit ? UNIT_NEIGHBORS[localUnit] : null;
  const altUnits = neighbors ? neighbors.filter((u) => u !== localUnit) : [];

  const isThumbnail =
    item.thumbnailUrl &&
    !item.thumbnailUrl.startsWith("data:image/svg+xml") &&
    !imgError;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`flex items-center gap-3 py-2.5 rounded-lg transition-opacity ${
        item.checked ? "opacity-40" : ""
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(item.id)}
        className={`w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
          item.checked
            ? "bg-primary border-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary"
        }`}
        aria-label={item.checked ? "Uncheck item" : "Check item"}
      >
        {item.checked && <Check className="w-3 h-3" />}
      </button>

      {/* Thumbnail */}
      <div className="w-8 h-8 shrink-0 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
        {isThumbnail ? (
          <img
            key={item.thumbnailUrl}
            src={item.thumbnailUrl!}
            alt={item.name}
            className="w-full h-full object-cover animate-in fade-in duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="text-[11px] font-bold text-muted-foreground uppercase">
            {item.name.slice(0, 2)}
          </span>
        )}
      </div>

      {/* Quantity stepper + unit — fixed width so names always align */}
      {isUnspecified ? (
        <div className="w-24 shrink-0" />
      ) : (
        <div className="flex items-center gap-2 w-24 shrink-0">
          {/* Stepper: ▲ qty ▼ */}
          <div className="flex flex-col items-center">
            <button
              onClick={handleIncrease}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
              aria-label="Increase quantity"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            {isEditingQty ? (
              <input
                type="text"
                inputMode="decimal"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                  if (e.key === "Escape") {
                    setIsEditingQty(false);
                  }
                }}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                className="text-sm font-semibold tabular-nums text-center leading-none py-0.5 w-10 bg-transparent border-b border-primary outline-none"
              />
            ) : (
              <span
                onClick={startEditing}
                className="text-sm font-semibold tabular-nums min-w-[1.5rem] text-center leading-none py-0.5 cursor-text hover:text-primary transition-colors"
              >
                {localUnit && localQty < 10
                  ? localQty.toFixed(1)
                  : formatQty(localQty)}
              </span>
            )}
            <button
              onClick={handleDecrease}
              disabled={parseFloat((localQty - step).toFixed(4)) <= 0}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded disabled:opacity-25 disabled:cursor-not-allowed"
              aria-label="Decrease quantity"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Unit + switcher */}
          {localUnit && (
            <div className="flex flex-col items-start gap-0.5 min-w-[2.5rem]">
              <span className="text-xs font-medium text-foreground leading-none">
                {localUnit}
              </span>
              {altUnits.length > 0 && (
                <div className="flex items-center gap-1">
                  {altUnits.map((u, i) => (
                    <span key={u} className="flex items-center gap-1">
                      {i > 0 && (
                        <span className="text-[9px] text-muted-foreground/40">
                          ·
                        </span>
                      )}
                      <button
                        onClick={() => handleUnitSwitch(u)}
                        className="text-[10px] text-muted-foreground/60 hover:text-primary transition-colors leading-none"
                        title={`Switch to ${u}`}
                      >
                        {u}
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ingredient name + optional recipe source */}
      <div className="flex-1 min-w-0 flex flex-col">
        <span
          className={`text-sm truncate ${
            item.checked
              ? "line-through text-muted-foreground"
              : "text-foreground"
          }`}
        >
          {item.name}
        </span>
        {showSource && item.sourceRecipe && (
          <span className="flex flex-wrap gap-1 mt-0.5">
            {item.sourceRecipe.split(",").map((name, i) => (
              <span
                key={i}
                className="text-[10px] leading-tight text-muted-foreground/70 bg-muted/60 rounded px-1.5 py-0.5"
              >
                {name.trim()}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(item.id)}
        className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded shrink-0"
        aria-label="Remove item"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ShoppingCartPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [inputValue, setInputValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [showSource, setShowSource] = useState(() => {
    try {
      return localStorage.getItem("cart-show-source") !== "false";
    } catch {
      return true;
    }
  });

  const toggleShowSource = () => {
    setShowSource((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("cart-show-source", String(next));
      } catch {}
      return next;
    });
  };

  const { data: items = [], isLoading } = useListCartItems({
    query: {
      queryKey: getListCartItemsQueryKey(),
      // Poll every 2.5 s while any item is still waiting for its thumbnail,
      // then stop automatically once all thumbnails have arrived.
      refetchInterval: (query) => {
        const data = query.state.data as CartItem[] | undefined;
        if (!data) return false;
        return data.some((item) => !item.thumbnailUrl) ? 2500 : false;
      },
    },
  });

  const addItems = useAddCartItems({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCartItemsQueryKey() });
        setInputValue("");
        setIsAdding(false);
      },
      onError: () => {
        toast({ title: "Failed to add item", variant: "destructive" });
        setIsAdding(false);
      },
    },
  });

  const deleteItem = useDeleteCartItem({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListCartItemsQueryKey() }),
      onError: () =>
        toast({ title: "Failed to remove item", variant: "destructive" }),
    },
  });

  const toggleItem = useToggleCartItem({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListCartItemsQueryKey() }),
    },
  });

  const updateItem = useUpdateCartItem({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListCartItemsQueryKey() }),
      onError: () =>
        toast({ title: "Failed to update quantity", variant: "destructive" }),
    },
  });

  const clearCart = useClearCart({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListCartItemsQueryKey() }),
      onError: () =>
        toast({ title: "Failed to clear cart", variant: "destructive" }),
    },
  });

  const handleAddItem = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setIsAdding(true);
    addItems.mutate({ data: { ingredients: [trimmed] } });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAddItem();
  };

  const handleUpdate = useCallback(
    (id: number, quantity: number, unit: string) => {
      updateItem.mutate({ id, data: { quantity, unit } });
    },
    [updateItem],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, CartItem[]>();
    for (const item of items) {
      const aisle = item.aisle || "Other";
      if (!map.has(aisle)) map.set(aisle, []);
      map.get(aisle)!.push(item);
    }
    const result: { aisle: string; items: CartItem[] }[] = [];
    for (const aisle of AISLE_ORDER) {
      if (map.has(aisle)) result.push({ aisle, items: map.get(aisle)! });
    }
    for (const [aisle, aisleItems] of map) {
      if (!AISLE_ORDER.includes(aisle))
        result.push({ aisle, items: aisleItems });
    }
    return result;
  }, [items]);

  const totalCount = items.length;
  const checkedCount = items.filter((i) => i.checked).length;
  const hasSourceItems = items.some((i: CartItem) => Boolean(i.sourceRecipe));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-xl">
          <CartIcon className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="font-serif font-bold text-2xl text-foreground">
            Shopping Cart
          </h1>
          <p className="text-sm text-muted-foreground">
            {totalCount === 0
              ? "No items yet"
              : `${totalCount} item${totalCount !== 1 ? "s" : ""}${
                  checkedCount > 0 ? ` · ${checkedCount} checked` : ""
                }`}
          </p>
        </div>
        {hasSourceItems && (
          <button
            onClick={toggleShowSource}
            className={`ml-auto flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 border transition-colors ${
              showSource
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
            }`}
            title={showSource ? "Hide recipe sources" : "Show recipe sources"}
          >
            <BookOpen className="w-3.5 h-3.5" />
            {showSource ? "Hide sources" : "Show sources"}
          </button>
        )}
      </div>

      {/* Add item */}
      <div className="flex gap-2">
        <Input
          placeholder='Add ingredient (e.g. "3 bananas" or "1 cup flour")'
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
          disabled={isAdding}
        />
        <Button
          onClick={handleAddItem}
          disabled={!inputValue.trim() || isAdding}
          size="icon"
          className="shrink-0"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Bulk actions */}
      {totalCount > 0 && (
        <div className="flex gap-2 flex-wrap">
          {checkedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => clearCart.mutate({ params: { mode: "checked" } })}
              disabled={clearCart.isPending}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Remove checked ({checkedCount})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-destructive hover:text-destructive"
            onClick={() => clearCart.mutate({ params: { mode: "all" } })}
            disabled={clearCart.isPending}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Clear all
          </Button>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent mr-3" />
          Loading cart...
        </div>
      ) : totalCount === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
          <div className="text-6xl">🛒</div>
          <div>
            <p className="font-serif font-semibold text-lg text-foreground">
              Your cart is empty
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Add ingredients above to get started
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <AnimatePresence>
            {grouped.map(({ aisle, items: aisleItems }) => (
              <motion.div
                key={aisle}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-card border border-border/60 rounded-2xl overflow-hidden"
              >
                <div className="flex items-center gap-2 px-4 py-3 bg-muted/40 border-b border-border/40">
                  <span className="text-lg">{AISLE_ICONS[aisle] ?? "🛒"}</span>
                  <h2 className="font-semibold text-sm text-foreground">
                    {aisle}
                  </h2>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {aisleItems.length} item
                    {aisleItems.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="px-4 py-1 divide-y divide-border/20">
                  <AnimatePresence>
                    {aisleItems.map((item) => (
                      <CartItemRow
                        key={item.id}
                        item={item}
                        onToggle={(id) => toggleItem.mutate({ id })}
                        onDelete={(id) => deleteItem.mutate({ id })}
                        onUpdate={handleUpdate}
                        showSource={showSource}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
