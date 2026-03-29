import { defineConfig } from "drizzle-kit";
import path from "path";

const isDev = process.env.NODE_ENV === "development";

// DATABASE_URL     — production database (used in all non-development environments)
// DATABASE_URL_DEV — isolated dev database (required when NODE_ENV=development)
//
// To push schema to the dev database:
//   NODE_ENV=development pnpm --filter @workspace/db run push
//   (or the shorthand: pnpm --filter @workspace/db run push:dev)
//
// To push schema to the production database:
//   pnpm --filter @workspace/db run push
const databaseUrl = isDev
  ? process.env.DATABASE_URL_DEV
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    isDev
      ? "DATABASE_URL_DEV must be set when NODE_ENV=development."
      : "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
