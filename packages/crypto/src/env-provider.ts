import type { KekProvider } from "./envelope";

export function envKekProvider(env: NodeJS.ProcessEnv = process.env): KekProvider {
  const current = env.LWA_KEK_CURRENT ?? "v1";
  return {
    currentVersion: current,
    getKey(version) {
      const raw = env[`LWA_KEK_${version.toUpperCase()}`];
      if (!raw) throw new Error(`unknown kek version: ${version}`);
      const buf = Buffer.from(raw, "base64");
      if (buf.length !== 32) {
        throw new Error(`LWA_KEK_${version.toUpperCase()} must be 32 bytes (base64)`);
      }
      return buf;
    },
  };
}
