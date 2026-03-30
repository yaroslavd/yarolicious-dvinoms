import { defineConfig, devices } from "@playwright/test";

// Dev: the local Replit dev domain (default)
// Prod: set PLAYWRIGHT_BASE_URL to your deployed app URL, e.g.:
//   PLAYWRIGHT_BASE_URL=https://myapp.myuser.repl.co pnpm test:e2e:prod
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use the Replit-provided Chromium when available (avoids needing
        // `playwright install` which downloads a separate browser binary).
        ...(process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? {
              executablePath: process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE,
            }
          : {}),
      },
    },
  ],
});
