import type { KekProvider } from "./envelope";
import { resolveFileEnv } from "./file-env";

export function envKekProvider(env: NodeJS.ProcessEnv = process.env): KekProvider {
  const resolved = resolveFileEnv(env, ["LWA_KEK_V1"]);
  const current = resolved.LWA_KEK_CURRENT ?? "v1";
  return {
    currentVersion: current,
    getKey(version) {
      const raw = resolved[`LWA_KEK_${version.toUpperCase()}`];
      if (!raw) throw new Error(`unknown kek version: ${version}`);
      const buf = Buffer.from(raw, "base64");
      if (buf.length !== 32) {
        throw new Error(`LWA_KEK_${version.toUpperCase()} must be 32 bytes (base64)`);
      }
      return buf;
    },
  };
}
