#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Must enable pgvector before drizzle push, since the schema declares
# halfvec(1536) columns and push would otherwise fail with
# `type "halfvec" does not exist`.
pnpm --filter @workspace/scripts srd:bootstrap
pnpm --filter db push
pnpm --filter @workspace/scripts srd:setup
# Populate `reference_chunks` from the public 5e SRD API. Idempotent: skips
# chunks whose (edition, slug, kind, content_hash) already exists. We pass
# SRD_NO_EMBED=1 because the Replit AI Integrations OpenAI proxy does not
# expose the embeddings endpoint; the FTS path on the generated tsvector
# column is sufficient for Rules Lookup and Compare Editions.
SRD_NO_EMBED=1 pnpm --filter @workspace/scripts srd:ingest-api
