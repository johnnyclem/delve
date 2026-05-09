import { sql } from "drizzle-orm";
import { db, type SrdEdition, type EntityChunkSourceField } from "@workspace/db";
import { vectorToSqlLiteral } from "./entityEmbeddings";

const RRF_K = 60;
const SEM_LIMIT = 30;
const BM25_LIMIT = 30;
const FINAL_LIMIT = 8;

// websearch_to_tsquery ANDs every term, which kills recall on natural-language
// questions ("how do critical hits work in this campaign according to our house
// rules?"). Convert it to an OR-joined query so any single content word can
// match — ts_rank still surfaces the most relevant chunk first.
const OR_TSQUERY_SQL = (q: string) =>
  sql`NULLIF(replace(websearch_to_tsquery('english', ${q})::text, '&', '|'), '')::tsquery`;

// Tokens that add noise to ranking when OR-joining. Postgres' english stopword
// list already drops "this", "do", "in", "to", etc., but conversational filler
// like "how", "work", "according" survive and end up dominating ts_rank against
// large corpora. We strip them in JS before handing the cleaned string to
// websearch_to_tsquery. If the entire query is filler (e.g. "how does it
// work?") we fall back to the original string so recall is preserved.
const KEYWORD_FILLER = new Set([
  "how", "what", "why", "when", "where", "who", "whom", "whose", "which",
  "work", "works", "working", "worked",
  "use", "uses", "using", "used",
  "do", "does", "did", "doing", "done",
  "is", "are", "was", "were", "be", "been", "being", "am",
  "have", "has", "had", "having",
  "can", "could", "should", "would", "will", "shall", "may", "might", "must",
  "this", "that", "these", "those",
  "the", "a", "an", "and", "or", "but", "not",
  "in", "on", "at", "to", "of", "for", "with", "by", "from", "as",
  "about", "into", "than", "then", "there", "here",
  "i", "me", "my", "mine", "we", "us", "our", "ours",
  "you", "your", "yours", "they", "them", "their", "theirs", "it", "its",
  "according", "any", "some", "all", "such", "any",
  "really", "very", "just", "only", "also", "even", "still", "ever",
  "thing", "things", "stuff", "way", "ways",
  "please", "thanks", "thank",
  "tell", "tells", "told", "say", "says", "said",
  "know", "knows", "known", "think", "thinks",
  "want", "wants", "need", "needs",
  "if", "so",
]);

export function buildKeywordQuery(raw: string): string {
  const tokens = raw.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const filtered = tokens.filter(
    (t) => t.length >= 3 && !KEYWORD_FILLER.has(t),
  );
  if (filtered.length === 0) return raw;
  return filtered.join(" ");
}

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

export interface HomebrewHit {
  ruleId: number;
  title: string;
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
  const keywordQuery = buildKeywordQuery(query);

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
        ORDER BY ts_rank(tsv, ${OR_TSQUERY_SQL(keywordQuery)}) DESC
      ) AS rnk
      FROM reference_chunks
      WHERE edition = ${edition}
        AND tsv @@ ${OR_TSQUERY_SQL(keywordQuery)}
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
  const keywordQuery = buildKeywordQuery(query);

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
        ORDER BY ts_rank(cec.tsv, ${OR_TSQUERY_SQL(keywordQuery)}) DESC
      ) AS rnk
      FROM campaign_entity_chunks cec
      ${gatingJoin}
      WHERE cec.campaign_id = ${campaignId}
        AND cec.tsv @@ ${OR_TSQUERY_SQL(keywordQuery)}
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

export async function retrieveHomebrew(
  query: string,
  queryEmbedding: number[] | null,
  campaignId: number,
  limit: number = FINAL_LIMIT,
): Promise<HomebrewHit[]> {
  if (!query.trim()) return [];
  const keywordQuery = buildKeywordQuery(query);

  await db.execute(sql`SET LOCAL hnsw.iterative_scan = 'relaxed_order'`).catch(() => {});

  const semanticPart = queryEmbedding
    ? sql`
        SELECT id, ROW_NUMBER() OVER (
          ORDER BY embedding <=> ${vectorToSqlLiteral(queryEmbedding)}::halfvec(1536) ASC
        ) AS rnk
        FROM homebrew_rules
        WHERE campaign_id = ${campaignId}
          AND active = true
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorToSqlLiteral(queryEmbedding)}::halfvec(1536)
        LIMIT ${SEM_LIMIT}
      `
    : sql`SELECT NULL::int AS id, NULL::int AS rnk WHERE false`;

  const result = await db.execute<{
    id: number;
    title: string;
    body_md: string;
    score: number;
  }>(sql`
    WITH semantic AS (
      ${semanticPart}
    ),
    keyword AS (
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY ts_rank(tsv, ${OR_TSQUERY_SQL(keywordQuery)}) DESC
      ) AS rnk
      FROM homebrew_rules
      WHERE campaign_id = ${campaignId}
        AND active = true
        AND tsv @@ ${OR_TSQUERY_SQL(keywordQuery)}
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
    SELECT hr.id, hr.title, hr.body_md, f.score
    FROM fused f
    JOIN homebrew_rules hr ON hr.id = f.id
    ORDER BY f.score DESC
    LIMIT ${limit}
  `);

  return result.rows.map((r) => ({
    ruleId: r.id,
    title: r.title,
    bodyMd: r.body_md,
    score: Number(r.score),
  }));
}
