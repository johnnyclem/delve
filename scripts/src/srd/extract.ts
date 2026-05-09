// Extracts the Foundry VTT dnd5e v5.x SRD packs from their LevelDB format
// into JSON files under `data/srd/2014/` and `data/srd/2024/`.
//
// Usage:
//   FOUNDRY_DND5E_PATH=/abs/path/to/foundryvtt/Data/systems/dnd5e \
//     pnpm --filter @workspace/scripts run srd:extract
//
// The dnd5e v5.x system layout exposes the SRD packs under two top-level
// directories — `packs/` (5.2 / 2024) and `packs-2014/` (5.1 / 2014). Each
// contained directory is a LevelDB-backed Foundry pack. We iterate every
// such pack and call the Foundry CLI's `extractPack` helper.
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

interface ExtractTarget {
  edition: "2014" | "2024";
  packsDir: string;
  outDir: string;
}

const FOUNDRY_PATH = process.env.FOUNDRY_DND5E_PATH;
if (!FOUNDRY_PATH) {
  console.error("FOUNDRY_DND5E_PATH must be set to the Foundry dnd5e system root.");
  process.exit(1);
}

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const DATA_ROOT = path.join(REPO_ROOT, "data", "srd");

const TARGETS: ExtractTarget[] = [
  { edition: "2024", packsDir: path.join(FOUNDRY_PATH, "packs"), outDir: path.join(DATA_ROOT, "2024") },
  { edition: "2014", packsDir: path.join(FOUNDRY_PATH, "packs-2014"), outDir: path.join(DATA_ROOT, "2014") },
];

async function main() {
  // Lazy-load the Foundry CLI so the script can at least print a useful
  // error if the package isn't installed.
  let extractPack: (src: string, dest: string, opts?: Record<string, unknown>) => Promise<unknown>;
  try {
    // @ts-expect-error — optional peer dep installed only in environments
    // where the SRD packs are extracted.
    const mod = (await import("@foundryvtt/foundryvtt-cli")) as {
      extractPack: typeof extractPack;
    };
    extractPack = mod.extractPack;
  } catch {
    console.error(
      "[srd:extract] '@foundryvtt/foundryvtt-cli' is not installed. Install it locally with:\n" +
        "  pnpm --filter @workspace/scripts add -D @foundryvtt/foundryvtt-cli\n" +
        "before running this script.",
    );
    process.exit(1);
  }

  for (const target of TARGETS) {
    if (!existsSync(target.packsDir)) {
      console.warn(`[srd:extract] skipping ${target.edition}: ${target.packsDir} does not exist`);
      continue;
    }
    await fs.mkdir(target.outDir, { recursive: true });
    const entries = await fs.readdir(target.packsDir, { withFileTypes: true });
    const packs = entries.filter((e) => e.isDirectory());
    console.log(`[srd:extract] ${target.edition}: ${packs.length} pack(s) found in ${target.packsDir}`);
    for (const packDir of packs) {
      const src = path.join(target.packsDir, packDir.name);
      const dest = path.join(target.outDir, packDir.name);
      await fs.mkdir(dest, { recursive: true });
      console.log(`  - extracting ${packDir.name} -> ${dest}`);
      await extractPack(src, dest, { log: false });
    }
  }
  console.log("[srd:extract] done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
