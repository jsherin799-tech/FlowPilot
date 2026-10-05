import { test, expect } from "@playwright/test";

test("should login as admin and view dashboard project board", async ({ page }) => {
  await page.goto("http://localhost:3000");
  const adminButton = page.getByRole("button", { name: /admin/i });
  await adminButton.click();
  await expect(page).toHaveURL("http://localhost:3000/dashboard");
  await expect(page.getByText("Project board")).toBeVisible();
});
