import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Cookie, Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../");
const seedScript = path.resolve(repoRoot, "services/api/test/e2e-seed.ts");
const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

export type TenantScenario = {
  name: string;
  slug: string;
  role: "network_admin" | "station_manager" | "board_viewer" | "analyst";
  scopeNodeKeys?: string[];
  hierarchy?: Array<{
    key: string;
    type: "station" | "broadcast_channel" | "language_channel";
    name: string;
    slug: string;
    parentKey?: string;
  }>;
  metrics?: Array<{
    hierarchyKey: string;
    category: "tv_households" | "web_visitors";
    effectiveTotal: number;
    rawTotal?: number;
    sourceBreakdown: Record<string, number>;
    hasAdjustments?: boolean;
  }>;
};

type SeedResult = {
  tenants: Array<{ slug: string; nodeIds: Record<string, string> }>;
};

export async function provisionUser(tenants: TenantScenario[]) {
  const suffix = randomUUID().slice(0, 8);
  const email = `playwright-${suffix}@example.com`;
  const password = `Pass-${suffix}!123`;
  const name = `Playwright ${suffix}`;

  const signUpRes = await fetch(`${apiBaseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3001",
      referer: "http://localhost:3001/",
    },
    body: JSON.stringify({ email, password, name }),
  });

  if (!signUpRes.ok) {
    throw new Error(`sign-up failed with ${signUpRes.status}: ${await signUpRes.text()}`);
  }

  const output = execFileSync(
    "pnpm",
    ["--filter", "@lwa/api", "exec", "tsx", seedScript, JSON.stringify({ email, tenants })],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL ?? "postgres://lwa:lwa_dev@localhost:5432/lwa_dev",
      },
      encoding: "utf8",
    },
  );

  return { email, password, name, seed: JSON.parse(output) as SeedResult };
}

export async function loginViaUi(page: Page, credentials: { email: string; password: string }) {
  const response = await page.request.post(`${apiBaseUrl}/api/auth/sign-in/email`, {
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:5173",
      referer: "http://localhost:5173/login",
    },
    data: credentials,
  });

  if (!response.ok()) {
    throw new Error(`sign-in failed with ${response.status()}: ${await response.text()}`);
  }

  const cookies: Cookie[] = response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === "set-cookie")
    .map((header) => {
      const [nameValue = ""] = header.value.split(";", 1);
      const [name = "", ...valueParts] = nameValue.split("=");
      return {
        name,
        value: valueParts.join("="),
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: /httponly/i.test(header.value),
        secure: false,
        sameSite: /samesite=lax/i.test(header.value) ? "Lax" : "Strict",
      };
    });

  await page.context().addCookies(cookies);
  await page.goto("/");
}
