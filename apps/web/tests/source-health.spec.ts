import { expect, test } from "@playwright/test";
import { loginViaUi, provisionUser } from "./support/e2e";

const CONNECTOR_SEED = {
  key: "manual_satellite",
  status: "active" as const,
  enabled: true,
  lastRunAt: "2025-02-01T03:00:00.000Z",
  lastError: null,
  runs: [
    {
      status: "success" as const,
      startedAt: "2025-02-01T03:00:00.000Z",
      finishedAt: "2025-02-01T03:05:00.000Z",
      periodStart: "2025-01-01T00:00:00.000Z",
      periodEnd: "2025-02-01T00:00:00.000Z",
      recordsWritten: 42,
      errorCode: null,
      errorMessage: null,
      warnings: [],
    },
  ],
};

test("network_admin can view source health list and detail", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Health Tenant NA",
      slug: `health-na-${suffix}`,
      role: "network_admin",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "Health Station",
          slug: `health-station-na-${suffix}`,
        },
      ],
      connectors: [CONNECTOR_SEED],
    },
  ]);

  const tenantSlug = user.seed.tenants[0]!.slug;

  await loginViaUi(page, user);
  await page.goto(`/${tenantSlug}/sources`);

  // Source health list heading
  await expect(page.getByRole("heading", { name: "Source health" })).toBeVisible();

  // Connector row shows source name
  await expect(page.getByText("Satellite (Manual)")).toBeVisible();

  // Click the detail link for the connector
  await page.getByRole("link", { name: /view/i }).first().click();

  // Detail page shows connector name
  await expect(page.getByRole("heading", { name: "Satellite (Manual)" })).toBeVisible();

  // Detail page shows recent runs
  await expect(page.getByText("success")).toBeVisible();

  // Back link is present
  await expect(page.getByRole("link", { name: /back/i })).toBeVisible();
});

test("station_manager can view source health list and detail", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Health Tenant SM",
      slug: `health-sm-${suffix}`,
      role: "station_manager",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "Health Station SM",
          slug: `health-station-sm-${suffix}`,
        },
      ],
      connectors: [CONNECTOR_SEED],
    },
  ]);

  const tenantSlug = user.seed.tenants[0]!.slug;

  await loginViaUi(page, user);
  await page.goto(`/${tenantSlug}/sources`);

  await expect(page.getByRole("heading", { name: "Source health" })).toBeVisible();
  await expect(page.getByText("Satellite (Manual)")).toBeVisible();

  await page.getByRole("link", { name: /view/i }).first().click();

  await expect(page.getByRole("heading", { name: "Satellite (Manual)" })).toBeVisible();
  await expect(page.getByText("success")).toBeVisible();
});

test("source health list shows status metadata for configured connectors", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Health Meta Tenant",
      slug: `health-meta-${suffix}`,
      role: "network_admin",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "Meta Station",
          slug: `health-meta-station-${suffix}`,
        },
      ],
      connectors: [
        {
          key: "manual_satellite",
          status: "error",
          enabled: false,
          lastRunAt: "2025-01-15T03:00:00.000Z",
          lastError: "Connection timed out",
          runs: [],
        },
      ],
    },
  ]);

  const tenantSlug = user.seed.tenants[0]!.slug;

  await loginViaUi(page, user);
  await page.goto(`/${tenantSlug}/sources`);

  await expect(page.getByRole("heading", { name: "Source health" })).toBeVisible();
  await expect(page.getByText("Satellite (Manual)")).toBeVisible();
  // Status is shown
  await expect(page.getByText("error", { exact: true }).first()).toBeVisible();
  // Disabled state
  await expect(page.getByText("Disabled")).toBeVisible();
  // Last error
  await expect(page.getByText("Connection timed out")).toBeVisible();
});

test("source health detail shows recent runs with records and timestamps", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Health Runs Tenant",
      slug: `health-runs-${suffix}`,
      role: "network_admin",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "Runs Station",
          slug: `health-runs-station-${suffix}`,
        },
      ],
      connectors: [CONNECTOR_SEED],
    },
  ]);

  const tenantSlug = user.seed.tenants[0]!.slug;
  const connectorId = user.seed.tenants[0]!.connectorIds["manual_satellite"]!;

  await loginViaUi(page, user);
  await page.goto(`/${tenantSlug}/sources/${connectorId}`);

  // Connector summary
  await expect(page.getByRole("heading", { name: "Satellite (Manual)" })).toBeVisible();

  // Run data
  await expect(page.getByText("success")).toBeVisible();
  await expect(page.getByText("42")).toBeVisible();
});

test("source health detail shows empty state when no runs exist", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Health No Runs Tenant",
      slug: `health-norun-${suffix}`,
      role: "network_admin",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "No Runs Station",
          slug: `health-norun-station-${suffix}`,
        },
      ],
      connectors: [
        {
          key: "manual_satellite",
          status: "active",
          enabled: true,
          runs: [],
        },
      ],
    },
  ]);

  const tenantSlug = user.seed.tenants[0]!.slug;
  const connectorId = user.seed.tenants[0]!.connectorIds["manual_satellite"]!;

  await loginViaUi(page, user);
  await page.goto(`/${tenantSlug}/sources/${connectorId}`);

  await expect(page.getByRole("heading", { name: "Satellite (Manual)" })).toBeVisible();
  await expect(page.getByText(/no runs/i)).toBeVisible();
});

test("source health list shows empty state when no connectors configured", async ({ page }) => {
  const suffix = Date.now();
  const user = await provisionUser([
    {
      name: "Health Empty Tenant",
      slug: `health-empty-${suffix}`,
      role: "network_admin",
      hierarchy: [
        {
          key: "station",
          type: "station",
          name: "Empty Station",
          slug: `health-empty-station-${suffix}`,
        },
      ],
      connectors: [],
    },
  ]);

  const tenantSlug = user.seed.tenants[0]!.slug;

  await loginViaUi(page, user);
  await page.goto(`/${tenantSlug}/sources`);

  await expect(page.getByRole("heading", { name: "Source health" })).toBeVisible();
  await expect(page.getByText(/no sources configured/i)).toBeVisible();
});
