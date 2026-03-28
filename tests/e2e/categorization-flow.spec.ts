import { test, expect } from "@playwright/test";

const MOCK_CATEGORIES = [
  { uid: "cat-soups", name: "Soups" },
  { uid: "cat-nytimes", name: "NYTimes" },
];

const MOCK_PREVIEW_RESPONSE = {
  suggestions: [
    {
      recipeId: 1,
      recipeName: "Minestrone Soup",
      currentCategories: [],
      toAdd: [{ uid: "cat-soups", name: "Soups" }],
    },
    {
      recipeId: 2,
      recipeName: "NYT Pasta",
      currentCategories: ["Italian"],
      toAdd: [{ uid: "cat-nytimes", name: "NYTimes" }],
    },
  ],
};

const MOCK_APPLY_RESPONSE = {
  applied: 2,
  errors: [],
};

test.describe("AI Categorization — Settings page flow (mocked API)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/paprika/credentials", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ configured: true, email: "chef@example.com" }),
      });
    });

    await page.route("**/api/paprika/categorize-preview", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_PREVIEW_RESPONSE),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/api/paprika/categorize-apply", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(MOCK_APPLY_RESPONSE),
        });
      } else {
        await route.continue();
      }
    });
  });

  test("Settings page renders Paprika Integration and Categorize Recipes cards", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("h1")).toContainText("Settings");
    await expect(page.getByText("Paprika Integration")).toBeVisible();
    await expect(page.getByText("Categorize Recipes")).toBeVisible();
  });

  test("Generate Preview button triggers categorize-preview API and renders preview widget", async ({ page }) => {
    await page.goto("/settings");

    const generateBtn = page.getByRole("button", { name: /generate preview|re-generate preview/i });
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeEnabled();

    const [previewResponse] = await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/paprika/categorize-preview")),
      generateBtn.click(),
    ]);

    expect(previewResponse.status()).toBe(200);
    const body = await previewResponse.json();
    expect(body).toHaveProperty("suggestions");
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions).toHaveLength(2);

    await expect(page.getByText(/2 recipes analyzed/i)).toBeVisible({ timeout: 5000 });
  });

  test("Preview widget renders recipe cards with suggested category badges", async ({ page }) => {
    await page.goto("/settings");

    const generateBtn = page.getByRole("button", { name: /generate preview|re-generate preview/i });

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/paprika/categorize-preview")),
      generateBtn.click(),
    ]);

    await expect(page.getByText("Minestrone Soup")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("NYT Pasta")).toBeVisible({ timeout: 5000 });

    await expect(page.getByText(/\+ Soups/)).toBeVisible();
    await expect(page.getByText(/\+ NYTimes/)).toBeVisible();
  });

  test("Apply button triggers categorize-apply API and shows success result", async ({ page }) => {
    await page.goto("/settings");

    const generateBtn = page.getByRole("button", { name: /generate preview|re-generate preview/i });

    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/paprika/categorize-preview")),
      generateBtn.click(),
    ]);

    await expect(page.getByText("Minestrone Soup")).toBeVisible({ timeout: 5000 });

    const applyBtn = page.getByRole("button", { name: /apply & sync/i });
    await expect(applyBtn).toBeVisible({ timeout: 5000 });
    await expect(applyBtn).toBeEnabled();

    const [applyResponse] = await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/paprika/categorize-apply")),
      applyBtn.click(),
    ]);

    expect(applyResponse.status()).toBe(200);
    const applyBody = await applyResponse.json();
    expect(applyBody.applied).toBe(2);
    expect(applyBody.errors).toHaveLength(0);

    await expect(
      page.getByRole("main").getByText(/2 recipes updated/i).first()
    ).toBeVisible({ timeout: 5000 });
  });
});
