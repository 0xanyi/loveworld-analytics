import { expect, test } from "@playwright/test";
import { loginViaUi, provisionUser } from "./support/e2e";

test("root redirects unauthenticated users to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("authenticated single-tenant user reaches tenant dashboard", async ({ page }) => {
  const user = await provisionUser([
    {
      name: "Single Tenant",
      slug: `single-${Date.now()}`,
      role: "network_admin",
      hierarchy: [
        { key: "station", type: "station", name: "Single Station", slug: `single-station-${Date.now()}` },
      ],
    },
  ]);

  await loginViaUi(page, user);
  await expect(page).toHaveURL(new RegExp(`/${user.seed.tenants[0]!.slug}$`));
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("authenticated multi-tenant user sees tenant switcher page", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Tenant One",
      slug: `tenant-one-${suffix}`,
      role: "network_admin",
      hierarchy: [{ key: "station", type: "station", name: "Station One", slug: `station-one-${suffix}` }],
    },
    {
      name: "Tenant Two",
      slug: `tenant-two-${suffix}`,
      role: "board_viewer",
      hierarchy: [{ key: "station", type: "station", name: "Station Two", slug: `station-two-${suffix}` }],
    },
  ]);

  await loginViaUi(page, user);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Choose a tenant" })).toBeVisible();
  await expect(page.getByText("Tenant One")).toBeVisible();
  await expect(page.getByText("Tenant Two")).toBeVisible();
});
