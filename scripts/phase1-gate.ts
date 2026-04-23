import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const API_BASE = process.env.API_BASE_URL ?? process.env.AUTH_BASE_URL ?? "http://localhost:3001";
const WEB_ORIGIN = process.env.PHASE1_GATE_ORIGIN ?? firstAllowedOrigin() ?? "http://localhost:5173";
const RUN_ID = process.env.PHASE1_GATE_ID ?? crypto.randomUUID().slice(0, 8);
const TENANT_NAME = `Phase 1 Gate ${RUN_ID}`;
const TENANT_SLUG = `phase1-gate-${RUN_ID}`;
const ADMIN_EMAIL = `phase1-gate-${RUN_ID}@example.com`;
const ADMIN_PASSWORD = process.env.PHASE1_GATE_PASSWORD ?? randomBytes(24).toString("base64url");

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env,
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

async function request(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }
  return res;
}

function cookieHeaderFrom(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = headers.getSetCookie?.() ?? [];
  const fallback = res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : [];
  const cookies = (setCookies.length > 0 ? setCookies : fallback)
    .map((cookie) => cookie.split(";")[0])
    .filter(Boolean);
  if (cookies.length === 0) throw new Error("sign-in response did not set cookies");
  return cookies.join("; ");
}

async function apiJson<T>(path: string, cookie: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T> {
  const res = await request(path, {
    method,
    headers: {
      cookie,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as T;
}

async function main() {
  console.log(`[phase1:gate] API_BASE=${API_BASE}`);
  await request("/health");

  console.log("[phase1:gate] creating tenant and admin user");
  run("pnpm", [
    "admin:create-tenant",
    "--name",
    TENANT_NAME,
    "--slug",
    TENANT_SLUG,
    "--admin-email",
    ADMIN_EMAIL,
    "--admin-name",
    "Phase 1 Gate Admin",
  ]);

  console.log("[phase1:gate] setting admin password");
  run("pnpm", ["admin:set-password", "--email", ADMIN_EMAIL], {
    ...process.env,
    ADMIN_PASSWORD,
  });

  console.log("[phase1:gate] signing in");
  const signIn = await request("/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: WEB_ORIGIN,
      referer: `${WEB_ORIGIN}/login`,
    },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const cookie = cookieHeaderFrom(signIn);

  console.log("[phase1:gate] creating hierarchy node");
  const node = await apiJson<{ id: string }>(`/tenants/${TENANT_SLUG}/hierarchy`, cookie, {
    type: "station",
    name: "Phase 1 Gate Station",
    slug: `phase1-gate-station-${RUN_ID}`,
  });

  console.log("[phase1:gate] configuring manual satellite connector");
  await apiJson<{ id: string }>(`/tenants/${TENANT_SLUG}/connectors`, cookie, {
    connectorKey: "manual_satellite",
    schedule: "0 3 * * *",
    credentials: {},
  });

  const monday = boardVisibleUtcWeekMonday();
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

  console.log("[phase1:gate] submitting manual entry");
  await apiJson<{ written: number }>(`/tenants/${TENANT_SLUG}/entries`, cookie, {
    connectorKey: "manual_satellite",
    entry: {
      hierarchyNodeId: node.id,
      period: {
        start: monday.toISOString().slice(0, 10),
        end: nextMonday.toISOString().slice(0, 10),
      },
      householdsReached: 12345,
      estimationMethod: "operator_report",
    },
  });

  console.log("[phase1:gate] polling board metrics");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const board = await apiJson<{
      tiles: Array<{ category: string; current: number }>;
    }>(
      `/tenants/${TENANT_SLUG}/metrics/board?hierarchyNodeId=${node.id}&period=week&granularity=week&comparison=none`,
      cookie,
    );
    const tv = board.tiles.find((tile) => tile.category === "tv_households");
    if (tv && tv.current > 0) {
      console.log(`[phase1:gate] success: tv_households=${tv.current}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error("board metrics did not become non-zero within 30s");
}

function firstAllowedOrigin(): string | undefined {
  return process.env.ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean)[0];
}

function boardVisibleUtcWeekMonday(): Date {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 7 : dow));
  return d;
}

main().catch((err) => {
  console.error(`[phase1:gate] failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
