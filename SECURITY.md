# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately via
[GitHub security advisories](https://github.com/d4ndel1on/pagegeist/security/advisories/new)
instead of opening a public issue. You will get a response within a week.

## Supported versions

Security fixes are released for the latest published version only.

## Design principles

- Zero runtime dependencies.
- User-provided text (phrases, `say()`, `data-pagegeist-say`) is only ever rendered via
  canvas `fillText` or `textContent` – never parsed as HTML.
- No `eval`/`new Function`, no inline scripts, no injected `<style>` elements (CSP friendly).
- Releases are published from CI via npm trusted publishing (OIDC) with provenance – no
  long-lived npm tokens.
- CI runs with read-only tokens, installs dependencies with `--ignore-scripts`, and pins
  all GitHub Actions to full commit SHAs (kept current by Dependabot).
