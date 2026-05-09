import { sql } from "drizzle-orm";
import { db, type SrdEdition, type EntityChunkSourceField } from "@workspace/db";
import { vectorToSqlLiteral } from "./entityEmbeddings";

const RRF_K = 60;
const SEM_LIMIT = 30;
const BM25_LIMIT = 30;
const FINAL_LIMIT = 8;

export interface ReferenceHit {
  chunkId: number;
  edition: SrdEdition;
  entityKind: string;
  entitySlug: string;
  section: string | null;
  title: string;
  bodyMd: string;
  sourceUrl: string | null;
  score: number;
}

export interface CampaignHit {
  chunkId: number;
  entityId: number;
  entityKind: string;
  entityName: string;
  entitySlug: string;
  sourceField: EntityChunkSourceField;
  bodyMd: string;
  score: number;
}

export async function retrieveReference(
  query: string,
  queryEmbedding: number[] | null,
  edition: SrdEdition,
  limit: number = FINAL_LIMIT,
): Promise<ReferenceHit[]> {
  if (!query.trim()) return [];

  // Belt-and-suspenders recall.
  await db.execute(sql`SET LOCAL hnsw.iterative_scan = 'relaxed_order'`).catch(() => {});

  const semanticPart = queryEmbedding
    ? sql`
        SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> ${vectorToSqlLiteral(queryEmbedding)}::halfvec(1536) ASC) AS rnk
        FROM reference_chunks
        WHERE edition = ${edition} AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorToSqlLiteral(queryEmbedding)}::halfvec(1536)
        LIMIT ${SEM_LIMIT}
      `
    : sql`SELECT NULL::int AS id, NULL::int AS rnk WHERE false`;

  const result = await db.execute<{
    id: number;
    edition: string;
    entity_kind: string;
    entity_slug: string;
    section: string | null;
    title: string;
    body_md: string;
    source_url: string | null;
    score: number;
  }>(sql`
    WITH semantic AS (
      ${semanticPart}
    ),
    keyword AS (
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY ts_rank(tsv, websearch_to_tsquery('english', ${query})) DESC
      ) AS rnk
      FROM reference_chunks
      WHERE edition = ${edition}
        AND tsv @@ websearch_to_tsquery('english', ${query})
      LIMIT ${BM25_LIMIT}
    ),
    fused AS (
      SELECT id, SUM(weight) AS score FROM (
        SELECT id, 1.0 / (${RRF_K} + rnk) AS weight FROM semantic
        UNION ALL
        SELECT id, 1.0 / (${RRF_K} + rnk) AS weight FROM keyword
      ) s
      WHERE id IS NOT NULL
      GROUP BY id
    )
    SELECT rc.id, rc.edition, rc.entity_kind, rc.entity_slug,
           rc.section, rc.title, rc.body_md, rc.source_url,
           f.score
    FROM fused f
    JOIN reference_chunks rc ON rc.id = f.id
    ORDER BY f.score DESC
    LIMIT ${limit}
  `);

  return result.rows.map((r) => ({
    chunkId: r.id,
    edition: r.edition as SrdEdition,
    entityKind: r.entity_kind,
    entitySlug: r.entity_slug,
    section: r.section,
    title: r.title,
    bodyMd: r.body_md,
    sourceUrl: r.source_url,
    score: Number(r.score),
  }));
}

export async function retrieveCampaign(
  query: string,
  queryEmbedding: number[] | null,
  campaignId: number,
  opts: { isDm: boolean },
  limit: number = FINAL_LIMIT,
): Promise<CampaignHit[]> {
  if (!query.trim()) return [];

  await db.execute(sql`SET LOCAL hnsw.iterative_scan = 'relaxed_order'`).catch(() => {});

  // Player gating: only public_md chunks of revealed entities. DM: all.
  const gatingJoin = opts.isDm
    ? sql`JOIN campaign_entities ce ON ce.id = cec.entity_id`
    : sql`JOIN campaign_entities ce ON ce.id = cec.entity_id AND ce.revealed = true AND cec.source_field = 'public_md'`;

  const semanticPart = queryEmbedding
    ? sql`
        SELECT cec.id, ROW_NUMBER() OVER (
          ORDER BY cec.embedding <=> ${vectorToSqlLiteral(queryEmbedding)}::halfvec(1536) ASC
        ) AS rnk
        FROM campaign_entity_chunks cec
        ${gatingJoin}
        WHERE cec.campaign_id = ${campaignId}
          AND cec.embedding IS NOT NULL
        ORDER BY cec.embedding <=> ${vectorToSqlLiteral(queryEmbedding)}::halfvec(1536)
        LIMIT ${SEM_LIMIT}
      `
    : sql`SELECT NULL::int AS id, NULL::int AS rnk WHERE false`;

  const result = await db.execute<{
    id: number;
    entity_id: number;
    entity_kind: string;
    entity_name: string;
    entity_slug: string;
    source_field: string;
    body_md: string;
    score: number;
  }>(sql`
    WITH semantic AS (
      ${semanticPart}
    ),
    keyword AS (
      SELECT cec.id, ROW_NUMBER() OVER (
        ORDER BY ts_rank(cec.tsv, websearch_to_tsquery('english', ${query})) DESC
      ) AS rnk
      FROM campaign_entity_chunks cec
      ${gatingJoin}
      WHERE cec.campaign_id = ${campaignId}
        AND cec.tsv @@ websearch_to_tsquery('english', ${query})
      LIMIT ${BM25_LIMIT}
    ),
    fused AS (
      SELECT id, SUM(weight) AS score FROM (
        SELECT id, 1.0 / (${RRF_K} + rnk) AS weight FROM semantic
        UNION ALL
        SELECT id, 1.0 / (${RRF_K} + rnk) AS weight FROM keyword
      ) s
      WHERE id IS NOT NULL
      GROUP BY id
    )
    SELECT cec.id, cec.entity_id, ce.kind AS entity_kind, ce.name AS entity_name,
           ce.slug AS entity_slug, cec.source_field, cec.body_md, f.score
    FROM fused f
    JOIN campaign_entity_chunks cec ON cec.id = f.id
    JOIN campaign_entities ce ON ce.id = cec.entity_id
    ORDER BY f.score DESC
    LIMIT ${limit}
  `);

  return result.rows.map((r) => ({
    chunkId: r.id,
    entityId: r.entity_id,
    entityKind: r.entity_kind,
    entityName: r.entity_name,
    entitySlug: r.entity_slug,
    sourceField: r.source_field as EntityChunkSourceField,
    bodyMd: r.body_md,
    score: Number(r.score),
  }));
}
