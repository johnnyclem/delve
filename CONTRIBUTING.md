# Contributing

## Regenerating the OpenAPI Client

The API spec lives at `lib/api-spec/openapi.yaml`. When you add, remove, or change any route or schema, you must regenerate the typed hooks and Zod schemas.

**Command:**

```sh
pnpm --filter @workspace/api-spec run codegen
```

This uses [Orval](https://orval.dev/) (configured in `lib/api-spec/orval.config.ts`) to produce:

- `lib/api-client-react/src/generated/` — React-query hooks with a `customFetch` mutator
- `lib/api-zod/src/generated/` — Zod validation schemas

**When to regenerate:**

- Adding a new API route
- Changing request/response schemas
- Adding or renaming query parameters
- Changing path parameters

**Verification:**

After regenerating, check that the generated files changed as expected:

```sh
git diff --stat lib/api-client-react/src/generated/
git diff --stat lib/api-zod/src/generated/
```

Then run the lib typecheck to catch any type mismatches:

```sh
pnpm -w run typecheck:libs
```
