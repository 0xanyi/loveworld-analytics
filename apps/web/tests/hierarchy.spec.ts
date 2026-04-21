import { expect, test } from "@playwright/test";
import { loginViaUi, provisionUser } from "./support/e2e";

test("network admin can create, rename, and archive hierarchy nodes", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Hierarchy Tenant",
      slug: `hierarchy-${suffix}`,
      role: "network_admin",
      hierarchy: [
        { key: "root", type: "station", name: "Root Station", slug: `root-station-${suffix}` },
      ],
    },
  ]);

  await loginViaUi(page, user);
  await page.goto(`/${user.seed.tenants[0]!.slug}/settings/hierarchy`);

  await expect(page.getByRole("heading", { name: "Hierarchy", exact: true })).toBeVisible();

  await page.getByLabel("Node name").fill("Broadcast West");
  await page.getByLabel("Slug").fill("broadcast-west");
  await page.getByLabel("Type").selectOption("broadcast_channel");
  await page.getByRole("button", { name: "Create node" }).click();
  await expect(page.getByText("Broadcast West")).toBeVisible();

  await page.getByRole("button", { name: "Rename" }).nth(1).click();
  await page.getByLabel("New name").fill("Broadcast West Updated");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Broadcast West Updated")).toBeVisible();

  await page.getByRole("button", { name: "Archive" }).nth(1).click();
  await expect(page.getByText("Broadcast West Updated")).toHaveCount(0);
});
