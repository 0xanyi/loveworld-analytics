import { readFileSync } from "node:fs";

export function resolveFileEnv(
  source: NodeJS.ProcessEnv,
  keys: readonly string[],
): NodeJS.ProcessEnv {
  const resolved: NodeJS.ProcessEnv = { ...source };

  for (const key of keys) {
    const existing = resolved[key];
    if (typeof existing === "string" && existing.length > 0) continue;

    const filePath = resolved[`${key}_FILE`];
    if (!filePath) continue;

    resolved[key] = readFileSync(filePath, "utf8").trim();
  }

  return resolved;
}
