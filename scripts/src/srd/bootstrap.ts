// Enables the pgvector extension before `drizzle-kit push` runs. Required
// because the schema declares halfvec(1536) columns; without the extension,
// `push` fails with `type "halfvec" does not exist`, which then prevents
// reference_chunks / campaign_entity_chunks / homebrew_rules from being
// created and breaks the rest of srd:setup. Safe to re-run.
import { pool } from "@workspace/db";

async function main() {
  console.log("[srd:bootstrap] enabling pgvector extension...");
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");
  console.log("[srd:bootstrap] done");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
