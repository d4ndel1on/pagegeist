# AGENTS.md

Instructions for AI coding agents working **on** this repository. To **use** the package in
another project, read [docs/usage-for-agents.md](docs/usage-for-agents.md) instead.
Human-oriented details live in [CONTRIBUTING.md](CONTRIBUTING.md); this file lists what you must
not get wrong.

## What this is

`@d4ndel1on/pagegeist`: a procedurally drawn canvas mascot that walks on a web page's DOM.
Vanilla core (`src/index.ts`, engine in `src/core/`) plus a React adapter (`src/react/index.ts`).
ESM-only, built with tsdown to `dist/`. The playground in `playground/` is the live demo on
GitHub Pages.

## Commands

Node 24 (`.nvmrc`). Run `npm ci` once.

| Command | Purpose |
|---|---|
| `npm run ci` | The full gate CI runs: lint, typecheck, snippet check, tests, build, package checks, size budget, playground build. **Run before you call a change done.** |
| `npm test` | Vitest (happy-dom), deterministic via `seeded()` randomness |
| `npm run test:e2e` | Playwright smoke tests of `dist/` in Chromium, Firefox, WebKit and touch emulation (`npm run build` and `npx playwright install` first) |
| `npm run test:starters` | Packs the tarball, installs it into `examples/starters/*` (Next.js, Vite, React), builds them and tests them in production and dev mode (`npm run build` first) |
| `npm run typecheck` | `tsc` over `src`, `test`, `playground`, plus `examples/` and `e2e/` with their own tsconfigs |
| `npm run format` | Biome auto-fix (formatting, imports) |
| `npm run check:snippets` | Docs snippets must match `examples/`; `--fix` rewrites the docs |
| `npm run size` | size-limit budget (needs `npm run build` first) |
| `npm run dev` | Playground at http://localhost:5173 |

## Hard rules

- **Zero runtime dependencies.** Never add entries to `dependencies`. React stays an optional peer.
- **Size budget** (`size-limit` in `package.json`, min+brotli): core 24.5 kB, React adapter
  24.75 kB with little headroom. Never raise a limit on your own – it needs the repo owner's
  approval and a history entry in CONTRIBUTING.md › Size budget.
- **Golden render hash.** `test/wardrobe.test.ts` snapshots a hash over the canvas call log
  of the classic look (`test/__snapshots__/`). It changes whenever draw calls or style
  assignments change order, even if the pixels look identical. Never run `vitest -u` to make a
  failing render snapshot pass; report the change and get the owner's approval first.
  Comment-only and docs changes never affect it.
- **SSR safety.** No browser globals at module top level in `src/`; `dist/react.js` must keep
  `"use client"` as its first statement. `npm run check:dist` enforces both.
- **No DOM side effects by default**: no injected `<style>`, no `eval`, no attributes on the
  host page unless an option opts in (`markElements`). Styles go through the CSSOM (CSP-safe).
- **Public API changes** need: TSDoc on the type (description, `@defaultValue`, `@example` where
  useful), `docs/api.md`, and a changeset. The TSDoc ships in `dist/*.d.ts` and is what agents
  using the package read.
- **Docs snippets** that users copy belong in `examples/` (type-checked) and are embedded with a
  `<!-- snippet: examples/x.tsx -->` marker. Edit the example file, then run
  `node scripts/check-snippets.mjs --fix`. The same applies to the starter apps: their
  `app/layout.tsx`, `src/Layout.tsx` and `src/main.ts` are verbatim copies of examples (the
  script's `COPIES` list). Starters depend on the npm release, not on the working tree; CI
  installs the packed tarball into them with `--no-save`.
- **Language**: code, comments, docs, commits and changesets are in English.

## Releases

Changesets + `.github/workflows/release.yml`. Add a changeset (`npm run changeset`) for
user-facing changes, including anything that changes the published files (`dist/`, `docs/*.md`).
Never publish, tag or bump versions by hand – merging the "Version packages" PR publishes
via npm trusted publishing (OIDC) with provenance. Never commit, push or publish without the
owner's explicit approval.

## Layout

```
src/index.ts            vanilla entry (createPagegeist, exports)
src/react/index.ts      React adapter (<Pagegeist />, usePagegeist)
src/core/options.ts     public option types (TSDoc!) and option resolution
src/core/Engine.ts      lifecycle, loop, DOM overlay, PagegeistInstance
src/core/render/        procedural character drawing (affects the golden hash)
examples/               type-checked snippets embedded in README/docs/llms.txt
examples/starters/      complete Next.js / React / Vite apps (StackBlitz demos, CI integration tests)
e2e/                    Playwright: smoke.spec.ts (dist/ in real browsers), starters.spec.ts
docs/                   user docs, shipped in the npm package
playground/             demo app; playground/public/llms.txt, llms-full.txt is generated at build
scripts/                check-dist.mjs, check-snippets.mjs, build-starters.mjs
test/                   Vitest
```
