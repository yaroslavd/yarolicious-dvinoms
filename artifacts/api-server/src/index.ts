import app from "./app";
import { logger } from "./lib/logger";
import { seedOriginalVersionsForExistingRecipes } from "./routes/dietary";
import { regenerateMissingThumbnails } from "./routes/cart";

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

  // Seed original versions for all existing recipes that don't have one yet.
  try {
    await seedOriginalVersionsForExistingRecipes();
  } catch (seedErr: any) {
    logger.warn({ err: seedErr.message }, "Original version seeding skipped (non-fatal)");
  }

  // Fire-and-forget: regenerate thumbnails for any cart items missing them.
  regenerateMissingThumbnails().catch(() => {});
});
