import { pool } from "@workspace/db";
import { logger } from "./logger";

type SchemaCheck = {
  name: string;
  sql: string;
};

const CHECKS: SchemaCheck[] = [
  {
    name: "campaigns.default_edition",
    sql: "SELECT default_edition FROM campaigns LIMIT 1",
  },
  {
    name: "reference_chunks",
    sql: "SELECT id FROM reference_chunks LIMIT 1",
  },
  {
    name: "campaign_entities",
    sql: "SELECT id FROM campaign_entities LIMIT 1",
  },
];

export async function runSchemaHealthCheck(): Promise<void> {
  const failures: Array<{ check: string; error: string; code?: string }> = [];

  for (const check of CHECKS) {
    try {
      await pool.query(check.sql);
    } catch (err) {
      const error = err as { message?: string; code?: string };
      failures.push({
        check: check.name,
        error: error.message ?? String(err),
        code: error.code,
      });
    }
  }

  if (failures.length === 0) {
    logger.info(
      { checks: CHECKS.length },
      "Schema health check passed",
    );
    return;
  }

  logger.error(
    {
      event: "schema_drift_detected",
      failureCount: failures.length,
      failures,
      likelyFix:
        "Re-publish the API server to sync the production database schema (the application schema in lib/db is ahead of the deployed database).",
    },
    `SCHEMA DRIFT: ${failures.length} required schema element(s) missing or unreadable: ${failures.map((f) => f.check).join(", ")}`,
  );
}
