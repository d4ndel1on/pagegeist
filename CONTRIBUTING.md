# Contributing

Thanks for helping out! Issues and pull requests are welcome.

## Setup

Requires Node.js 24 (see `.nvmrc`).

```sh
npm ci
npm run dev        # playground at http://localhost:5173
```

Playground keyboard shortcuts (ignored while typing and with Cmd/Ctrl/Alt held):
**D** debug overlay · **P** pause/resume · **R** respawn · **S** slow motion.
The gait lab (live tuning of internal walk-cycle constants) is shown on the dev server and,
in production builds, only with `?lab` in the URL.

```sh
npm run test:coverage   # Vitest with V8 coverage (text summary + HTML report in coverage/)
npx playwright install  # once: browsers for the tests below
npm run build && npm run test:e2e        # smoke tests of dist/ in Chromium, Firefox, WebKit + touch
npm run build && npm run test:starters   # tarball installed into the Next.js / React / Vite starters
```

Both browser suites also run in CI (jobs `browsers` and `starters`). If a browser does not
start locally, run the suite in the official image instead, e.g.
`podman run --rm -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.64.1-noble npx playwright test`
(the image version must match `@playwright/test`).

## Before you open a pull request

```sh
npm run ci         # lint, typecheck, snippet check, tests, build, package/dist checks, size budget, playground build
npm run changeset  # describe user-facing changes (skip for docs/internal-only changes)
```

- **Formatting & linting**: [Biome](https://biomejs.dev) – `npm run format` fixes most issues.
- **Tests**: [Vitest](https://vitest.dev) with happy-dom. Physics and behavior tests use `seeded()` randomness, so they are deterministic. Add a test for every bug fix.
- **Size**: the bundle budget is enforced by `size-limit` (see [Size budget](#size-budget)). If you need to raise it, explain why in the PR.
- **Dependencies**: the package has zero runtime dependencies. Please keep it that way.
- **Docs snippets**: copy-paste snippets live in `examples/` (type-checked and linted) and are embedded in README.md, `docs/` and `playground/public/llms.txt` after a `<!-- snippet: examples/x.tsx -->` marker. Edit the example, then run `node scripts/check-snippets.mjs --fix`. The same script keeps pinned CDN versions in sync; the release workflow runs it after `changeset version`.
- **Language**: code, comments and docs are in English.

## Size budget

`size-limit` (configured in `package.json`, min+brotli incl. all dependencies) caps the
bundles at **24.5 kB** for the core and **24.75 kB** for the React adapter.

History:

- **24.25 kB → 24.5 kB** core only (approved by the repo owner; measured 24.26 kB /
  24.63 kB). The growth is the 16 owner-requested built-in phrases added in 0.1.1.
- **23.75 kB / 24 kB → 24.25 kB / 24.75 kB** (approved by the repo owner; measured
  23.98 kB / 24.38 kB). The growth comes from the owner-requested pose-dependent hands
  (palm, fingers and thumb; relaxed, grip, open and flat poses) and the redrawn lace-up
  platform heels (eyelets, lacing, lug sole, block heel), partly offset by removing the
  footprints.
- **22.5 kB / 22.75 kB → 23.75 kB / 24 kB** before the first release (measured
  23.36 kB / 23.75 kB). The ~0.9 kB of growth buys:
  - drag/pause robustness (releasing her on pause, `respawn()` and lost pointer capture, full rollback when setup fails),
  - `devicePixelRatio` and page-visibility handling (pixel-sized canvas, sleeping loop while paused, stopped loop in hidden tabs),
  - declarative React props with change detection and `handle.on()`,
  - option validation (`size`, `zIndex`, `respawnAfter`),
  - the `roundRect` fallback for the speech bubble,
  - render caches (wrapped bubble lines, memoized gait hip height) and the cheaper scroll handling in the world scan.

Each limit has roughly 0.25–0.4 kB of headroom. Keep growth intentional: raise a limit only with
a justification in the PR and update this note.

## Source maps

`tsdown` emits linked source maps (`dist/*.js.map`) with `sourcesContent`, so consumers can
debug down to the original TypeScript without `src/` in the package. Declaration maps are not
shipped (a small plugin in `tsdown.config.ts` strips their dangling `sourceMappingURL`
comment); `npm run check:dist` verifies all of this.

They are optional by construction: a bundler only reads a dependency's maps when the
consumer turns on source maps, and never copies them into a production build. Measured
before the first release with a scratch Vite 8 / esbuild app installing the packed tarball:

| | tarball | unpacked | consumer production JS |
| --- | --- | --- | --- |
| with maps (shipped) | 136.8 kB | 467.3 kB | identical (Vite 8 and esbuild) |
| without maps | 53.2 kB | 161.7 kB | identical |
| maps without `sourcesContent` | 76.7 kB | 265.6 kB | identical |

Rejected alternatives: maps without `sourcesContent` point at `src/*.ts` that is not
published (shipping `src/` would cost about as much as embedding it); `hidden` maps or a
separate subpath/package break the automatic lookup by bundlers and DevTools.

## Project layout

```
src/
  index.ts            vanilla entry: createPagegeist() + public types
  react/index.ts      React entry ("use client")
  core/
    Engine.ts         overlay, loop, input, rendering pipeline, public instance
    Mascot.ts         entity: body, actions, phrases, secondary motion
    StateMachine.ts   generic state machine
    states.ts         state machine states (IDLE, WALK, JUMP, …)
    behavior.ts       decision making ("what next?")
    physics.ts        jump solver, gravity, landing
    gait.ts           walk-cycle tuning shared by physics and renderer (internal)
    World.ts          DOM → platforms, safe area
    options.ts        public option types + defaults
    phrases.ts        built-in phrases + resolution
    random.ts         seedable random source (`seeded()`)
    types.ts          shared internal types (states, vectors)
    render/           GothRenderer (procedural character), walk cycle, effects, render queue
playground/           Vite + React demo app (deployed to GitHub Pages)
scripts/              build helpers (check-dist.mjs: post-build dist sanity checks; check-snippets.mjs: docs snippets)
examples/             type-checked snippets embedded in the docs
  starters/           complete Next.js / React / Vite apps: StackBlitz demos and CI integration tests
e2e/                  Playwright browser tests (smoke tests of dist/, starter apps)
test/                 Vitest tests
docs/                 documentation (shipped in the npm package)
```

## Releases

Releases are automated with [Changesets](https://github.com/changesets/changesets) in
`.github/workflows/release.yml`:

1. Pull requests with user-facing changes include a changeset (`npm run changeset`).
2. On `main`, the release workflow runs the full `npm run ci` gate and opens/updates a
   "Version packages" PR that bumps the version and updates `CHANGELOG.md`.
3. Merging that PR publishes to npm via
   [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC, no `NPM_TOKEN`)
   with provenance.

### First publish (one-time bootstrap)

A trusted publisher can only be configured on npmjs.com for a package that already exists,
so the very first version usually has to be published once by hand (verify the current
requirements in the npm docs linked above):

1. From a clean, up-to-date checkout of `main` (after the first "Version packages" PR is
   merged, so `package.json` has the real version): `npm login`, `npm ci && npm run ci`, then
   `npm publish --provenance=false` (`publishConfig.provenance` is `true`, but provenance can
   only be generated in CI).
2. On npmjs.com → package settings → *Trusted publisher*: GitHub Actions, repository
   `d4ndel1on/pagegeist`, workflow `release.yml` (no environment).
3. Optionally restrict publishing to trusted publishers only (disallow tokens).

The release workflow's own publish attempt for that version fails until the trusted publisher
is configured; that is expected (`changeset publish` skips versions that already exist on npm).
From then on every release goes through the workflow.

### Playground on GitHub Pages

`.github/workflows/pages.yml` builds the playground (`npm run build:playground`) and deploys
`dist-playground/` on every push to `main` (or manually via *Run workflow*). Pages must be
enabled once under repository *Settings → Pages → Source: GitHub Actions*.

## License

By contributing you agree that your code is licensed under MIT and contributions to the
character artwork under CC0 1.0 (see `LICENSE` and `LICENSE-ARTWORK`).
