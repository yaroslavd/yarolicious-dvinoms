import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chatgptPendingRecipesTable = pgTable("chatgpt_pending_recipes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ingredients: text("ingredients").notNull(),
  directions: text("directions").notNull(),
  servings: text("servings"),
  totalTime: text("total_time"),
  prepTime: text("prep_time"),
  cookTime: text("cook_time"),
  notes: text("notes"),
  nutritionalInfo: text("nutritional_info"),
  source: text("source"),
  sourceUrl: text("source_url"),
  imageUrl: text("image_url"),
  categories: text("categories"),
  difficulty: text("difficulty"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertChatgptPendingRecipeSchema = createInsertSchema(chatgptPendingRecipesTable).omit({
  id: true,
  createdAt: true,
  status: true,
});

export type InsertChatgptPendingRecipe = z.infer<typeof insertChatgptPendingRecipeSchema>;
export type ChatgptPendingRecipe = typeof chatgptPendingRecipesTable.$inferSelect;

export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  hashedKey: text("hashed_key").notNull(),
  maskedKey: text("masked_key").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ApiKey = typeof apiKeysTable.$inferSelect;
