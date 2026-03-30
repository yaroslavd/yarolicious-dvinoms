import { test, expect } from "@playwright/test";

test.describe("Settings page", () => {
  test("renders Settings heading and Dietary Profiles card", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.locator("h1")).toContainText("Settings");
    await expect(page.getByText("Dietary Profiles")).toBeVisible();
  });

  test("does not show Paprika Integration card", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("h1")).toContainText("Settings");
    await expect(page.getByText("Paprika Integration")).not.toBeVisible();
  });

  test("renders ChatGPT Integration card", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("ChatGPT Integration")).toBeVisible();
  });
});
