# api-server

Express API for the D&D Campaign Manager. Built to ESM via esbuild (`build.mjs`).

## Runtime assets

Files the server needs to read at runtime (PDF templates, email templates,
prompt files, fonts, etc.) live under `artifacts/api-server/assets/`.

`build.mjs` recursively copies that whole directory next to the bundled
`dist/index.mjs`, so the on-disk layout differs between source and bundle:

- source (vitest, dev): `src/lib/foo.ts` → `../../assets/<rel>`
- bundled (`pnpm start`, deployed): `dist/index.mjs` → `./assets/<rel>`

To avoid having every caller hand-roll a path probe, all asset reads must go
through the helper in `src/lib/assets.ts`:

```ts
import { loadAsset } from "./assets";

const bytes = await loadAsset("dnd-5e-character-sheet.pdf");
// or for nested files:
const tmpl = await loadAsset("emails/welcome.html");
```

`loadAsset` tries the source path then the bundled path, and throws
`AssetMissingError` (with both candidates listed) if neither resolves.

### Adding a new server asset

1. Drop the file anywhere under `artifacts/api-server/assets/`.
2. Read it via `await loadAsset("<path-relative-to-assets/>")`.
3. That's it — `build.mjs` already copies the whole `assets/` tree, so no build
   change is required.

Do **not** read from `import.meta.url` + a hand-written relative path; that
pattern broke the character-sheet PDF in production once already.
