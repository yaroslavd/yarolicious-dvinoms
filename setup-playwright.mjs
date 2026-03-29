/**
 * Sets up the Playwright browser in Replit's environment.
 *
 * Replit provides a pre-installed Chromium at REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE.
 * Playwright expects the binary at a specific cache path — this script creates a
 * symlink so both point to the same binary, avoiding a separate `playwright install`.
 */
import { existsSync, mkdirSync, symlinkSync } from "fs";
import { dirname } from "path";

const chromiumExe = process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE;

if (!chromiumExe) {
  console.log("REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE not set — skipping browser setup.");
  process.exit(0);
}

// Playwright 1.55 (chromium revision 1187) looks here for the headless shell binary.
const expectedPath =
  "/home/runner/workspace/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell";

if (existsSync(expectedPath)) {
  process.exit(0);
}

mkdirSync(dirname(expectedPath), { recursive: true });
symlinkSync(chromiumExe, expectedPath);
console.log(`Playwright browser linked: ${chromiumExe} → ${expectedPath}`);
