import { test, expect } from "@playwright/test";

test("landing page loads for unauthenticated users", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /see every plate event turn into an operational decision/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /login/i })).toBeVisible();
});

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /email/i })).toBeVisible();
  await expect(page.getByLabel(/password/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});
