import type { Database } from "../client";
import { source } from "../schema/source";

const SOURCES = [
  { key: "manual_satellite", name: "Satellite (Manual)", category: "tv_broadcast", authMethod: "none" },
  { key: "manual_freeview", name: "Freeview (Manual)", category: "tv_broadcast", authMethod: "none" },
  { key: "castnet_events", name: "CastNet Player Events", category: "web", authMethod: "api_key" },
  { key: "cloudflare_analytics", name: "Cloudflare Analytics", category: "web", authMethod: "api_key" },
  { key: "ga4", name: "Google Analytics 4", category: "web", authMethod: "service_account" },
  { key: "youtube", name: "YouTube Data API", category: "streaming", authMethod: "oauth2" },
  { key: "smart_tv_telemetry", name: "Smart TV App Telemetry", category: "app", authMethod: "api_key" },
  { key: "meta_graph", name: "Meta Graph (FB + IG)", category: "social", authMethod: "oauth2" },
  { key: "tiktok", name: "TikTok Business API", category: "social", authMethod: "oauth2" },
  { key: "x", name: "X (Twitter) API", category: "social", authMethod: "api_key" },
] as const;

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
