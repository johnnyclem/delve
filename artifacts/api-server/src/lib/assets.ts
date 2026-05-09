import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Runtime asset loader for the api-server.
 *
 * Why this exists:
 *   Files under `artifacts/api-server/assets/` need to be reachable both when
 *   the server runs from source (vitest, dev) and when it runs from the
 *   bundled output (`pnpm start`, deployed). build.mjs copies `assets/` next
 *   to `dist/index.mjs` so the on-disk layout differs:
 *
 *     - source:  artifacts/api-server/src/lib/foo.ts → ../../assets/<rel>
 *     - bundled: artifacts/api-server/dist/index.mjs  → ./assets/<rel>
 *
 *   Rather than have every caller probe both paths, route all asset reads
 *   through `loadAsset(relPath)` / `getAssetCandidatePaths(relPath)`.
 *
 * To add a new server asset:
 *   1. Drop the file under `artifacts/api-server/assets/` (any subdir is fine).
 *   2. Read it via `await loadAsset("subdir/file.ext")`.
 *   3. No build.mjs change needed — the whole `assets/` tree is copied.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

export class AssetMissingError extends Error {
  constructor(public readonly relPath: string, public readonly candidates: string[], cause?: unknown) {
    super(`Server asset "${relPath}" not found. Tried: ${candidates.join(", ")}`);
    this.name = "AssetMissingError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Returns the candidate absolute paths where `relPath` may live, in priority
 * order. Exposed so callers that need the path string (e.g. error messages,
 * streaming APIs) can resolve it the same way as `loadAsset`.
 */
export function getAssetCandidatePaths(relPath: string): string[] {
  return [
    // Source layout: src/lib/assets.ts → ../../assets/<rel>
    join(__dirname, "..", "..", "assets", relPath),
    // Bundled layout: dist/index.mjs → ./assets/<rel>
    join(__dirname, "assets", relPath),
  ];
}

/**
 * Read a runtime asset shipped under `artifacts/api-server/assets/`.
 * Throws `AssetMissingError` if no candidate path resolves.
 */
export async function loadAsset(relPath: string): Promise<Uint8Array> {
  const candidates = getAssetCandidatePaths(relPath);
  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      return await readFile(candidate);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new AssetMissingError(relPath, candidates, lastErr);
}
