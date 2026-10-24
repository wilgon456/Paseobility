import { existsSync } from "node:fs";

export const BUNDLED_PASEO_CLI =
  "/Applications/Paseo.app/Contents/Resources/bin/paseo";

// Use the app bundle on macOS when present; otherwise rely on the PATH command.
export function resolvePaseoCli(
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): string {
  return platform === "darwin" && exists(BUNDLED_PASEO_CLI)
    ? BUNDLED_PASEO_CLI
    : "paseo";
}
