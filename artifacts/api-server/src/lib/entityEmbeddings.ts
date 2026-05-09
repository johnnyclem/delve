// Thin wrapper around `@workspace/entity-embeddings` that wires the API's
// pino logger into the shared pipeline. The actual chunking, hashing,
// embedding, and DB write logic lives in the shared library so the operator
// backfill script (`scripts/src/backfill-entity-embeddings.ts`) and the live
// API path can never drift.
import {
  syncEntityChunks as sharedSyncEntityChunks,
  embedQuery as sharedEmbedQuery,
  vectorToSqlLiteral as sharedVectorToSqlLiteral,
  ENTITY_TEXT_FIELDS as SHARED_ENTITY_TEXT_FIELDS,
  type EntityFieldUpdate,
} from "@workspace/entity-embeddings";
import { logger } from "./logger";

export const ENTITY_TEXT_FIELDS = SHARED_ENTITY_TEXT_FIELDS;

export function syncEntityChunks(
  entityId: number,
  campaignId: number,
  fields: EntityFieldUpdate[],
): Promise<void> {
  return sharedSyncEntityChunks(entityId, campaignId, fields, { logger });
}

export function embedQuery(query: string): Promise<number[] | null> {
  return sharedEmbedQuery(query, { logger });
}

export function vectorToSqlLiteral(vec: number[]): string {
  return sharedVectorToSqlLiteral(vec);
}
