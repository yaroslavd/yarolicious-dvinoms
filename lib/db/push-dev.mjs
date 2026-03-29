/**
 * Dev schema push: runs drizzle-kit push targeting the isolated dev database (heliumdb_dev).
 *
 * Usage:
 *   pnpm --filter @workspace/db run push:dev
 *   pnpm --filter @workspace/db run push:dev-force
 *
 * DATABASE_URL     → production database (plain `push` script targets this)
 * DATABASE_URL_DEV → isolated dev database (this script targets this)
 */
import { execSync } from "child_process";

const prodUrl = process.env.DATABASE_URL;
if (!prodUrl) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const devUrl = process.env.DATABASE_URL_DEV ?? prodUrl.replace(/\/[^/?]+(\?.*)?$/, "/heliumdb_dev$1");

const env = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL_DEV: devUrl,
};

const force = process.argv.includes("--force");
const cmd = force
  ? "drizzle-kit push --force --config ./drizzle.config.ts"
  : "drizzle-kit push --config ./drizzle.config.ts";

execSync(cmd, { stdio: "inherit", env });
