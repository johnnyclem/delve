import {
  pool,
  campaignsTable,
  campaignMembersTable,
  campaignEntitiesTable,
  campaignEntityChunksTable,
  charactersTable,
  sessionLogsTable,
  referenceChunksTable,
  homebrewRulesTable,
} from "@workspace/db";
import { getTableColumns, getTableName, type Table } from "drizzle-orm";
import { logger } from "./logger";

// Curated list of "critical" tables whose presence and columns are
// validated against the live database on boot. The column list for each
// table is derived from the Drizzle schema in `lib/db/src/schema/` so
// adding a new column there automatically extends coverage.
const CRITICAL_TABLES: Table[] = [
  campaignsTable,
  campaignMembersTable,
  campaignEntitiesTable,
  campaignEntityChunksTable,
  charactersTable,
  sessionLogsTable,
  referenceChunksTable,
  homebrewRulesTable,
];

type Failure = {
  check: string;
  error: string;
  code?: string;
};

function expectedColumnsByTable(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const table of CRITICAL_TABLES) {
    const tableName = getTableName(table);
    const columns = getTableColumns(table);
    const colNames = new Set<string>(
      Object.values(columns).map((c) => (c as { name: string }).name),
    );
    map.set(tableName, colNames);
  }
  return map;
}

export async function runSchemaHealthCheck(): Promise<void> {
  const expected = expectedColumnsByTable();
  const tableNames = Array.from(expected.keys());
  const failures: Failure[] = [];

  let actualRows: Array<{ table_name: string; column_name: string }> = [];
  try {
    const result = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [tableNames],
    );
    actualRows = result.rows;
  } catch (err) {
    const error = err as { message?: string; code?: string };
    logger.error(
      {
        event: "schema_drift_detected",
        failureCount: 1,
        failures: [
          {
            check: "information_schema.columns",
            error: error.message ?? String(err),
            code: error.code,
          },
        ],
      },
      "SCHEMA DRIFT: unable to read information_schema.columns to verify schema",
    );
    return;
  }

  const actualByTable = new Map<string, Set<string>>();
  for (const row of actualRows) {
    let cols = actualByTable.get(row.table_name);
    if (!cols) {
      cols = new Set();
      actualByTable.set(row.table_name, cols);
    }
    cols.add(row.column_name);
  }

  let checkCount = 0;
  for (const [tableName, expectedCols] of expected) {
    const actualCols = actualByTable.get(tableName);
    if (!actualCols) {
      checkCount += 1;
      failures.push({
        check: tableName,
        error: `table "${tableName}" is missing from the database`,
      });
      continue;
    }
    for (const colName of expectedCols) {
      checkCount += 1;
      if (!actualCols.has(colName)) {
        failures.push({
          check: `${tableName}.${colName}`,
          error: `column "${colName}" is missing from table "${tableName}"`,
        });
      }
    }
  }

  if (failures.length === 0) {
    logger.info(
      { checks: checkCount, tables: tableNames.length },
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
