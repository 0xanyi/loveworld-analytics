import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { loginViaUi, provisionUser } from "./support/e2e";

async function openAccountPanel(page: Page) {
  const panel = page.locator("#account-panel");
  await page.getByRole("button", { name: "Account menu" }).click();
  if ((await panel.count()) === 0) {
    await page.getByRole("button", { name: "Account menu" }).click();
  }
  await expect(panel).toBeVisible();
  return panel;
}

test("single-tenant users do not see switch tenant in the account panel", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const user = await provisionUser([
    {
      name: "Single Tenant Menu",
      slug: `single-menu-${suffix}`,
      role: "network_admin",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "Single Station",
          slug: `single-station-${suffix}`,
        },
      ],
    },
  ]);

  const tenantSlug = user.seed.tenants[0]!.slug;

  await loginViaUi(page, user);
  await page.goto(`/${tenantSlug}`);

  const accountPanel = await openAccountPanel(page);
  await expect(accountPanel.getByText("Signed in as")).toBeVisible();
  await expect(accountPanel.getByRole("link", { name: /Switch tenant/i })).toHaveCount(0);
  await expect(accountPanel.getByRole("button", { name: /Sign out/i })).toBeVisible();
});

test("multi-tenant users see switch tenant in the account panel", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const user = await provisionUser([
    {
      name: "Tenant One",
      slug: `tenant-one-menu-${suffix}`,
      role: "network_admin",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "Station One",
          slug: `station-one-menu-${suffix}`,
        },
      ],
    },
    {
      name: "Tenant Two",
      slug: `tenant-two-menu-${suffix}`,
      role: "board_viewer",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "Station Two",
          slug: `station-two-menu-${suffix}`,
        },
      ],
    },
  ]);

  const tenantSlug = user.seed.tenants[0]!.slug;

  await loginViaUi(page, user);
  await page.goto("/");
  await page.getByRole("link", { name: /Tenant One/i }).click();
  await expect(page).toHaveURL(new RegExp(`/${tenantSlug}$`));

  const accountPanel = await openAccountPanel(page);

  await expect(accountPanel.getByRole("link", { name: /Switch tenant/i })).toBeVisible();
});

test("sign-out failure keeps the user on the tenant page and shows an error", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const user = await provisionUser([
    {
      name: "Signout Failure",
      slug: `signout-failure-${suffix}`,
      role: "network_admin",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "Failure Station",
          slug: `failure-station-${suffix}`,
        },
      ],
    },
  ]);

  const tenantSlug = user.seed.tenants[0]!.slug;

  await loginViaUi(page, user);

  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/auth/sign-out")) {
        return new Response(JSON.stringify({ message: "boom" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      return originalFetch(input, init);
    };
  });
  await page.goto(`/${tenantSlug}`);

  const accountPanel = await openAccountPanel(page);
  await accountPanel.getByRole("button", { name: /^Sign out$/i }).click();

  await expect(page).toHaveURL(new RegExp(`/${tenantSlug}$`));
  await expect(page.getByRole("alert")).toContainText("Unable to sign out");
});

test("sign-out success redirects to login", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const user = await provisionUser([
    {
      name: "Signout Success",
      slug: `signout-success-${suffix}`,
      role: "network_admin",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "Success Station",
          slug: `success-station-${suffix}`,
        },
      ],
    },
  ]);

  const tenantSlug = user.seed.tenants[0]!.slug;

  await loginViaUi(page, user);
  await page.goto(`/${tenantSlug}`);

  const accountPanel = await openAccountPanel(page);
  await accountPanel.getByRole("button", { name: /^Sign out$/i }).click();

  await expect(page).toHaveURL(/\/login$/);
});
