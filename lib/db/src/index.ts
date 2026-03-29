import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const isDev = process.env.NODE_ENV === "development";

// DATABASE_URL     — production database (used in all non-development environments)
// DATABASE_URL_DEV — isolated dev database (required when NODE_ENV=development)
//
// This split ensures dev mistakes cannot corrupt real user data.
// The dev API server sets NODE_ENV=development automatically via its `dev` npm script.
const connectionString = isDev
  ? process.env.DATABASE_URL_DEV
  : process.env.DATABASE_URL;

if (!connectionString) {
  if (isDev) {
    throw new Error(
      "DATABASE_URL_DEV must be set when NODE_ENV=development. " +
        "Add this secret with the connection string for the isolated dev database (heliumdb_dev). " +
        "Run: node -e 'const u=process.env.DATABASE_URL; console.log(u.replace(/\\/[^\\/]+$/, \"/heliumdb_dev\"))' " +
        "in the Shell to get the value.",
    );
  } else {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
