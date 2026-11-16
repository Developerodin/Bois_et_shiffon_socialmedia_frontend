import { test, expect } from "@playwright/test";

test.describe("Screen 1.1 shell smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });
});
