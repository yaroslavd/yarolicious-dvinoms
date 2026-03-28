import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recipesTable = pgTable("recipes", {
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
  rating: integer("rating").notNull().default(0),
  exportedToPaprika: boolean("exported_to_paprika").notNull().default(false),
  paprikaUid: text("paprika_uid"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRecipeSchema = createInsertSchema(recipesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type Recipe = typeof recipesTable.$inferSelect;
