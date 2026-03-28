import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { recipesTable } from "./recipes";
import { dietaryProfilesTable } from "./dietary_profiles";

export const recipeComplianceScoresTable = pgTable("recipe_compliance_scores", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipesTable.id, { onDelete: "cascade" }),
  profileId: integer("profile_id")
    .notNull()
    .references(() => dietaryProfilesTable.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertComplianceScoreSchema = createInsertSchema(recipeComplianceScoresTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertComplianceScore = z.infer<typeof insertComplianceScoreSchema>;
export type ComplianceScore = typeof recipeComplianceScoresTable.$inferSelect;
