import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { recipesTable } from "./recipes";
import { dietaryProfilesTable } from "./dietary_profiles";
import { recipeVersionsTable } from "./recipe_versions";

export const recipeComplianceScoresTable = pgTable("recipe_compliance_scores", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipesTable.id, { onDelete: "cascade" }),
  profileId: integer("profile_id")
    .notNull()
    .references(() => dietaryProfilesTable.id, { onDelete: "cascade" }),
  versionId: integer("version_id").references(() => recipeVersionsTable.id, {
    onDelete: "cascade",
  }),
  score: integer("score").notNull(),
  reason: text("reason").notNull(),
  prosList: jsonb("pros_list").$type<string[]>(),
  consList: jsonb("cons_list").$type<string[]>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertComplianceScoreSchema = createInsertSchema(
  recipeComplianceScoresTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertComplianceScore = z.infer<typeof insertComplianceScoreSchema>;
export type ComplianceScore = typeof recipeComplianceScoresTable.$inferSelect;
