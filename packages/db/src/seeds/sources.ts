import type { Database } from "../client";
import { source } from "../schema/source";
import type { sourceCategoryEnum, authMethodEnum } from "../schema/source";

type SourceCategory = (typeof sourceCategoryEnum.enumValues)[number];
type AuthMethod = (typeof authMethodEnum.enumValues)[number];

interface SeedSource {
  readonly key: string;
  readonly name: string;
  readonly category: SourceCategory;
  readonly authMethod: AuthMethod;
}

const SOURCES = [
  { key: "manual_satellite", name: "Satellite (Manual)", category: "tv_broadcast", authMethod: "none" },
  { key: "manual_freeview", name: "Freeview (Manual)", category: "tv_broadcast", authMethod: "none" },
  // castnet_events removed — CastNet platform retiring in favour of Love World Europe One,
  // which will be added as a new connector when it ships. See docs/plans/2026-04-20-plan-02-p0-connectors.md.
  { key: "cloudflare_analytics", name: "Cloudflare Analytics", category: "web", authMethod: "api_key" },
  { key: "ga4", name: "Google Analytics 4", category: "web", authMethod: "service_account" },
  { key: "youtube", name: "YouTube Data API", category: "streaming", authMethod: "oauth2" },
  { key: "smart_tv_telemetry", name: "Smart TV App Telemetry", category: "app", authMethod: "api_key" },
  { key: "meta_graph", name: "Meta Graph (FB + IG)", category: "social", authMethod: "oauth2" },
  { key: "tiktok", name: "TikTok Business API", category: "social", authMethod: "oauth2" },
  { key: "x", name: "X (Twitter) API", category: "social", authMethod: "api_key" },
] as const satisfies readonly SeedSource[];

export async function seedSources(db: Database): Promise<void> {
  for (const s of SOURCES) {
    await db
      .insert(source)
      .values(s)
      .onConflictDoUpdate({
        target: source.key,
        set: { name: s.name, category: s.category, authMethod: s.authMethod },
      });
  }
}
