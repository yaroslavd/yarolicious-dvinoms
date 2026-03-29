import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { recipesTable } from "./recipes";

export const recipeVersionsTable = pgTable("recipe_versions", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipesTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  ingredients: text("ingredients").notNull(),
  directions: text("directions").notNull(),
  isOriginal: boolean("is_original").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertRecipeVersionSchema = createInsertSchema(recipeVersionsTable).omit({
  id: true,
  createdAt: true,
  deletedAt: true,
});

export type InsertRecipeVersion = z.infer<typeof insertRecipeVersionSchema>;
export type RecipeVersion = typeof recipeVersionsTable.$inferSelect;
