import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const paprikaCredentialsTable = pgTable("paprika_credentials", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  encryptedPassword: text("encrypted_password").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PaprikaCredentials = typeof paprikaCredentialsTable.$inferSelect;
