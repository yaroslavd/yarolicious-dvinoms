import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dietaryProfilesTable = pgTable("dietary_profiles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertDietaryProfileSchema = createInsertSchema(dietaryProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type InsertDietaryProfile = z.infer<typeof insertDietaryProfileSchema>;
export type DietaryProfile = typeof dietaryProfilesTable.$inferSelect;
