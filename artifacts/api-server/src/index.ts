import app from "./app";
import { logger } from "./lib/logger";
import { migratePaprikaUids } from "./lib/migrate-paprika-uids";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Idempotent migration: ensure all recipe paprika_uids match their
  // deterministic values. No-ops when already correct.
  try {
    await migratePaprikaUids();
  } catch (migErr: any) {
    logger.warn({ err: migErr.message }, "Paprika UID migration skipped (non-fatal)");
  }
});
