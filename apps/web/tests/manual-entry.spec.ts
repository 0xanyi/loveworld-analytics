import { expect, test } from "@playwright/test";
import { loginViaUi, provisionUser } from "./support/e2e";

test("manual entry page shows configured connectors and hides unconfigured ones", async ({
  page,
}) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Entry Tenant",
      slug: `entry-${suffix}`,
      role: "network_admin",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "Entry Station",
          slug: `entry-station-${suffix}`,
        },
      ],
      connectors: [{ key: "manual_satellite", status: "active", enabled: true }],
    },
  ]);

  const tenantSlug = user.seed.tenants[0]!.slug;

  await loginViaUi(page, user);
  await page.goto(`/${tenantSlug}/entry`);

  // The source picker should contain the configured connector
  const sourceSelect = page.getByLabel("Source", { exact: true });
  await expect(sourceSelect).toBeVisible();
  await expect(sourceSelect.getByRole("option", { name: "Satellite Viewership (Manual)" })).toHaveCount(1);

  // unconfigured connector is NOT listed
  await expect(sourceSelect.getByRole("option", { name: "Freeview Viewership (Manual)" })).toHaveCount(0);
});

test("manual entry form can be submitted successfully", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Entry Submit Tenant",
      slug: `entry-submit-${suffix}`,
      role: "network_admin",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "Submit Station",
          slug: `submit-station-${suffix}`,
        },
      ],
      connectors: [{ key: "manual_satellite", status: "active", enabled: true }],
    },
  ]);

  const tenantSlug = user.seed.tenants[0]!.slug;
  const nodeIds = user.seed.tenants[0]!.nodeIds;

  await loginViaUi(page, user);
  await page.goto(`/${tenantSlug}/entry`);

  // Wait for Source select to appear, then wait for network idle so that
  // SvelteKit's client-side JS has fully settled before we fill the form.
  await expect(page.getByLabel("Source", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Select hierarchy node - label is "hierarchyNodeId *" (key used as label since no title)
  const hierarchyNodeId = nodeIds["station"]!;
  await page.getByLabel("hierarchyNodeId *").selectOption(hierarchyNodeId);

  // Fill period start - nested field label override is "Start *"
  await page.getByLabel("Start *").fill("2025-01-01");

  // Fill period end - nested field label override is "End *"
  await page.getByLabel("End *").fill("2025-02-01");

  // Fill households - label override is "Households Reached *"
  await page.getByLabel("Households Reached *").fill("5000");

  // estimationMethod is a select - first option will be pre-selected, no need to change

  // Submit
  await page.getByRole("button", { name: "Submit" }).click();

  // Verify success
  await expect(page.getByText("Entry saved")).toBeVisible();
});
