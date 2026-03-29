/**
 * Dev launcher: starts the API server connected to the isolated dev database.
 *
 * DATABASE_URL     → production database (used in deployed builds)
 * DATABASE_URL_DEV → isolated dev database (heliumdb_dev)
 *
 * DATABASE_URL_DEV is derived at runtime from the DATABASE_URL runtime secret
 * by swapping the database name to heliumdb_dev. No credentials are stored in
 * any config file; the derivation happens in-process from the already-secure
 * runtime secret. An explicit DATABASE_URL_DEV secret overrides this if set.
 */
import { execSync } from "child_process";

const prodUrl = process.env.DATABASE_URL;
if (!prodUrl) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Use DATABASE_URL_DEV if explicitly set as a secret; otherwise derive from
// DATABASE_URL by replacing the database name with heliumdb_dev.
const devUrl = process.env.DATABASE_URL_DEV ?? prodUrl.replace(/\/[^/?]+(\?.*)?$/, "/heliumdb_dev$1");

const env = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL_DEV: devUrl,
};

execSync("pnpm run build", { stdio: "inherit", env });
execSync("pnpm run start", { stdio: "inherit", env });
