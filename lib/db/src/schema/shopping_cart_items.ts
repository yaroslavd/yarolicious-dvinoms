import {
  pgTable,
  serial,
  text,
  boolean,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const AISLE_CATEGORIES = [
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
] as const;

export type AisleCategory = (typeof AISLE_CATEGORIES)[number];

export const shoppingCartItemsTable = pgTable("shopping_cart_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 3 })
    .notNull()
    .default("1"),
  unit: text("unit").notNull().default(""),
  aisle: text("aisle").notNull().default("Other"),
  checked: boolean("checked").notNull().default(false),
  thumbnailUrl: text("thumbnail_url"),
  sourceRecipe: text("source_recipe"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShoppingCartItemSchema = createInsertSchema(
  shoppingCartItemsTable,
).omit({
  id: true,
  createdAt: true,
});

export type InsertShoppingCartItem = z.infer<
  typeof insertShoppingCartItemSchema
>;
export type ShoppingCartItem = typeof shoppingCartItemsTable.$inferSelect;
