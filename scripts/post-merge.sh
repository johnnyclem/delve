#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Must enable pgvector before drizzle push, since the schema declares
# halfvec(1536) columns and push would otherwise fail with
# `type "halfvec" does not exist`.
pnpm --filter @workspace/scripts srd:bootstrap
pnpm --filter db push
pnpm --filter @workspace/scripts srd:setup
