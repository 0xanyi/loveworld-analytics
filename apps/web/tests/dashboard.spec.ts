import { expect, test } from "@playwright/test";
import { loginViaUi, provisionUser } from "./support/e2e";

test("tenant dashboard renders tiles and updates filters", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Dashboard Tenant",
      slug: `dashboard-${suffix}`,
      role: "network_admin",
      hierarchy: [
        { key: "station", type: "station", name: "Dashboard Station", slug: `dashboard-station-${suffix}` },
      ],
      metrics: [
        {
          hierarchyKey: "station",
          category: "tv_households",
          effectiveTotal: 1200,
          sourceBreakdown: { manual_satellite: 1200 },
        },
        {
          hierarchyKey: "station",
          category: "web_visitors",
          effectiveTotal: 3400,
          sourceBreakdown: { ga4: 3400 },
          hasAdjustments: true,
        },
      ],
    },
  ]);

  await loginViaUi(page, user);
  await expect(page.getByText("TV Households")).toBeVisible();
  await expect(page.getByText("Web Visitors")).toBeVisible();
  await expect(page.getByText("1.2K")).toBeVisible();
  await expect(page.getByText("3.4K")).toBeVisible();

  await page.getByRole("link", { name: "Month" }).click();
  await expect(page).toHaveURL(/period=month/);

  await page.getByRole("link", { name: "YoY" }).click();
  await expect(page).toHaveURL(/comparison=yoy/);
});
