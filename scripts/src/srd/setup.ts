// Sets up the parts of the `reference_chunks` schema that Drizzle does not
// natively support: enables pgvector, adds the generated tsvector column,
// the GIN index, partial HNSW indexes per edition, and the edition CHECK
// constraint. Safe to re-run.
import { pool } from "@workspace/db";

const SQL = `
  CREATE EXTENSION IF NOT EXISTS vector;

  ALTER TABLE reference_chunks DROP COLUMN IF EXISTS tsv;
  ALTER TABLE reference_chunks
    ADD COLUMN tsv tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(body_md, '')), 'B')
      ) STORED;

  CREATE INDEX IF NOT EXISTS reference_chunks_tsv_gin_idx
    ON reference_chunks USING gin (tsv);

  ALTER TABLE reference_chunks
    DROP CONSTRAINT IF EXISTS reference_chunks_edition_check;
  ALTER TABLE reference_chunks
    ADD CONSTRAINT reference_chunks_edition_check
      CHECK (edition IN ('2014', '2024'));

  CREATE INDEX IF NOT EXISTS reference_chunks_embedding_2014_hnsw_idx
    ON reference_chunks USING hnsw (embedding halfvec_cosine_ops)
    WHERE edition = '2014';

  CREATE INDEX IF NOT EXISTS reference_chunks_embedding_2024_hnsw_idx
    ON reference_chunks USING hnsw (embedding halfvec_cosine_ops)
    WHERE edition = '2024';

  ALTER TABLE campaigns
    DROP CONSTRAINT IF EXISTS campaigns_default_edition_check;
  ALTER TABLE campaigns
    ADD CONSTRAINT campaigns_default_edition_check
      CHECK (default_edition IN ('2014', '2024'));
`;

async function main() {
  console.log("[srd:setup] applying raw SQL setup...");
  await pool.query(SQL);
  console.log("[srd:setup] done");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
