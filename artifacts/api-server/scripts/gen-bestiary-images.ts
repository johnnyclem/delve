// Generates pixel-art monster artwork for every distinct SRD monster
// slug in `reference_chunks`, uploads each PNG to object storage, and
// records the result in `monster_images`. Idempotent and resumable —
// slugs that already have a row are skipped, so re-runs only top up
// missing art.
//
// Usage (from repo root):
//   pnpm --filter @workspace/api-server run gen:bestiary-images
//
// Optional env:
//   BESTIARY_IMAGE_LIMIT=5         — only generate up to N missing slugs
//   BESTIARY_IMAGE_CONCURRENCY=2   — concurrent OpenAI calls (default 2)
//   BESTIARY_IMAGE_DRY_RUN=1       — log what would be generated, no API calls

import pLimit from "p-limit";
import { sql } from "drizzle-orm";
import {
  db,
  pool,
  monsterImagesTable,
  referenceChunksTable,
} from "@workspace/db";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "../src/lib/objectStorage";

const MODEL = "gpt-image-1";
// NOTE: the task plan asked for 512×512, but `gpt-image-1` only
// supports 1024×1024 / 1024×1536 / 1536×1024 — the 256/512 sizes are
// dall-e-2 only. We render at 1024 and rely on the FE
// `image-rendering: pixelated` + 64-80px thumbnail downscale to
// preserve the chunky look.
const SIZE: "1024x1024" | "512x512" | "256x256" = "1024x1024";
// Style prompt is intentionally a single constant: changing it
// requires deleting the affected rows so re-runs regenerate them.
const STYLE_PROMPT = [
  "16-bit retro VGA pixel-art portrait, dark fantasy palette,",
  "centered subject filling the frame, simple solid dark background,",
  "thick outline, dithered shading, no text, no border,",
  "in the visual style of classic 1990s tile-based RPG sprites.",
].join(" ");

interface MissingSlug {
  slug: string;
  title: string;
  // Short body excerpt used to ground the prompt so the AI doesn't
  // invent a wildly off-brand creature for an obscure SRD entry.
  hint: string;
}

async function loadMissingSlugs(limit: number | null): Promise<MissingSlug[]> {
  // First chunk of each monster carries the metadata header (type,
  // size, alignment, CR) which is the most useful grounding hint.
  // We pick the lowest-id chunk per slug across both editions.
  const rows = await db.execute<{
    entity_slug: string;
    title: string;
    body_md: string;
  }>(sql`
    WITH ranked AS (
      SELECT
        entity_slug,
        title,
        body_md,
        row_number() OVER (
          PARTITION BY entity_slug ORDER BY id ASC
        ) AS rn
      FROM ${referenceChunksTable}
      WHERE ${referenceChunksTable.entityKind} = 'monster'
    )
    SELECT entity_slug, title, body_md
    FROM ranked
    WHERE rn = 1
      AND entity_slug NOT IN (SELECT slug FROM ${monsterImagesTable})
    ORDER BY entity_slug
  `);

  const all = rows.rows.map((r) => ({
    slug: r.entity_slug,
    title: r.title,
    hint: r.body_md.slice(0, 600),
  }));
  return limit != null ? all.slice(0, limit) : all;
}

function buildPrompt(m: MissingSlug): string {
  // Pull the structured header lines (**type**, **size**, **alignment**)
  // out of the markdown so the prompt has concrete grounding without
  // dumping the whole stat block.
  const headerBits: string[] = [];
  for (const key of ["type", "size", "alignment"]) {
    const re = new RegExp(`\\*\\*${key}\\*\\*:\\s*([^\\n]+)`, "i");
    const m2 = re.exec(m.hint);
    if (m2) headerBits.push(`${key} ${m2[1].trim().toLowerCase()}`);
  }
  const meta = headerBits.length > 0 ? ` (${headerBits.join(", ")})` : "";
  return `Pixel-art portrait of a ${m.title}${meta} from D&D 5e SRD. ${STYLE_PROMPT}`;
}

async function uploadPng(
  storage: ObjectStorageService,
  bytes: Buffer,
): Promise<string> {
  const uploadURL = await storage.getObjectEntityUploadURL();
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.length),
    },
    body: bytes,
  });
  if (!putRes.ok) {
    throw new Error(
      `Object storage PUT failed: ${putRes.status} ${putRes.statusText}`,
    );
  }
  return storage.normalizeObjectEntityPath(uploadURL);
}

async function main(): Promise<void> {
  const dryRun = process.env.BESTIARY_IMAGE_DRY_RUN === "1";
  const parsePositiveInt = (
    raw: string | undefined,
    label: string,
    fallback: number | null,
  ): number | null => {
    if (raw == null || raw === "") return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error(
        `Invalid ${label}=${JSON.stringify(raw)} — expected a positive integer.`,
      );
    }
    return n;
  };
  const limit = parsePositiveInt(
    process.env.BESTIARY_IMAGE_LIMIT,
    "BESTIARY_IMAGE_LIMIT",
    null,
  );
  const concurrency =
    parsePositiveInt(
      process.env.BESTIARY_IMAGE_CONCURRENCY,
      "BESTIARY_IMAGE_CONCURRENCY",
      2,
    ) ?? 2;

  const missing = await loadMissingSlugs(limit);
  if (missing.length === 0) {
    console.log("[bestiary-images] nothing to do — every slug already has an image.");
    return;
  }
  console.log(
    `[bestiary-images] ${missing.length} missing slug(s); concurrency=${concurrency}; dryRun=${dryRun}`,
  );

  const storage = new ObjectStorageService();
  const gate = pLimit(concurrency);
  let done = 0;
  let failed = 0;

  await Promise.all(
    missing.map((m) =>
      gate(async () => {
        const prompt = buildPrompt(m);
        try {
          if (dryRun) {
            console.log(`[bestiary-images] DRY ${m.slug}: ${prompt.slice(0, 120)}...`);
            done += 1;
            return;
          }
          const bytes = await generateImageBuffer(prompt, SIZE);
          const objectPath = await uploadPng(storage, bytes);
          await db
            .insert(monsterImagesTable)
            .values({
              slug: m.slug,
              objectPath,
              prompt,
              model: MODEL,
            })
            // Race-safe: another worker may have inserted concurrently.
            .onConflictDoNothing({ target: monsterImagesTable.slug });
          done += 1;
          console.log(
            `[bestiary-images] ${done}/${missing.length} ${m.slug} -> ${objectPath}`,
          );
        } catch (err) {
          failed += 1;
          console.warn(
            `[bestiary-images] FAIL ${m.slug}: ${(err as Error).message}`,
          );
        }
      }),
    ),
  );

  console.log(
    `[bestiary-images] done. generated=${done - failed} failed=${failed} total=${missing.length}`,
  );
}

main()
  .catch((err) => {
    console.error("[bestiary-images] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
