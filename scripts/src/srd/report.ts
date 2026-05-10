// Prints a quick coverage report of `reference_chunks` so we can see at
// a glance whether the SRD seed is complete.
//
// Usage:
//   pnpm --filter @workspace/scripts run srd:report
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";

interface RowKindCount extends Record<string, unknown> {
  edition: string;
  entity_kind: string;
  entities: number;
  chunks: number;
}

interface RowMonsterCr extends Record<string, unknown> {
  edition: string;
  cr: string | null;
  n: number;
}

function crSortKey(cr: string | null): number {
  if (cr == null) return 1e6;
  const t = cr.trim();
  if (t.includes("/")) {
    const [a, b] = t.split("/").map((s) => Number(s));
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 1e6;
}

async function main() {
  const byKind = await db.execute<RowKindCount>(sql`
    SELECT
      edition,
      entity_kind,
      count(DISTINCT entity_slug)::int AS entities,
      count(*)::int AS chunks
    FROM reference_chunks
    GROUP BY edition, entity_kind
    ORDER BY edition, entity_kind
  `);

  console.log("\n== Reference chunks coverage ==\n");
  console.log("edition  kind          entities  chunks");
  console.log("-------  ------------  --------  ------");
  for (const r of byKind.rows) {
    console.log(
      `${r.edition.padEnd(7)}  ${r.entity_kind.padEnd(12)}  ${String(r.entities).padStart(8)}  ${String(r.chunks).padStart(6)}`,
    );
  }

  const byCr = await db.execute<RowMonsterCr>(sql`
    SELECT
      edition,
      substring(body_md from '\\*\\*challenge rating\\*\\*:\\s*([^\\n]+)') AS cr,
      count(DISTINCT entity_slug)::int AS n
    FROM reference_chunks
    WHERE entity_kind = 'monster'
      AND body_md ILIKE '%challenge rating%'
    GROUP BY edition, cr
    ORDER BY edition
  `);

  const grouped = new Map<string, RowMonsterCr[]>();
  for (const r of byCr.rows) {
    const list = grouped.get(r.edition) ?? [];
    list.push(r);
    grouped.set(r.edition, list);
  }

  for (const [edition, rows] of grouped) {
    rows.sort((a, b) => crSortKey(a.cr) - crSortKey(b.cr));
    console.log(`\n== Monsters by CR — edition ${edition} (${rows.reduce((s, r) => s + r.n, 0)} total) ==`);
    for (const r of rows) {
      console.log(`  CR ${(r.cr ?? "—").padEnd(6)} ${r.n}`);
    }
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
