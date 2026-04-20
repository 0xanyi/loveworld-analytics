import { expect, test } from "@playwright/test";

test("root redirects unauthenticated users to /login", async ({ page }) => {
  await page.goto("/");
  expect(page.url()).toContain("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("login page renders email and password inputs", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign in/ })).toBeVisible();
});
