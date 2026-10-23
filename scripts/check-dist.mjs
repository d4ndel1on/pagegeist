#!/usr/bin/env node
// Post-build sanity checks for the published bundle (run after `npm run build`):
// 1. dist/react.js keeps the 'use client' directive as its first statement.
// 2. No emitted JS touches browser globals at module top level (SSR-safe imports),
//    checked statically and by actually importing both entries in plain Node (no DOM).
// 3. Source maps: every `//# sourceMappingURL` points to an existing map that embeds all its
//    sources (src/ is not published), and no .d.ts references a (not shipped) declaration map.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const errors = [];

const react = readFileSync(join(dist, 'react.js'), 'utf8');
if (!/^\s*["']use client["'];?/.test(react)) {
  errors.push('dist/react.js must start with the "use client" directive');
}

// Top-level statements are emitted unindented; flag any that reference DOM globals
// (except `typeof x` guards).
const GLOBALS = /\b(window|document|navigator|localStorage|sessionStorage|matchMedia|requestAnimationFrame)\b/;
for (const file of readdirSync(dist).filter((f) => f.endsWith('.js'))) {
  const lines = readFileSync(join(dist, file), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s/.test(line) || /^(\/\/|\/\*|\*)/.test(line)) return;
    const code = line.replace(/typeof\s+\w+/g, '').replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
    if (GLOBALS.test(code)) errors.push(`dist/${file}:${i + 1} top-level browser global access: ${line.trim()}`);
  });
}

let maps = 0;
for (const file of readdirSync(dist).filter((f) => f.endsWith('.js') || f.endsWith('.d.ts'))) {
  const url = readFileSync(join(dist, file), 'utf8').match(/\/\/# sourceMappingURL=(\S+)\s*$/)?.[1];
  if (file.endsWith('.d.ts')) {
    if (url) errors.push(`dist/${file} references a declaration map (${url}) that is not shipped`);
    continue;
  }
  if (!url) continue; // pure re-export entries (dist/index.js) have no map
  maps++;
  if (!existsSync(join(dist, url))) {
    errors.push(`dist/${file} references a missing source map: ${url}`);
    continue;
  }
  const map = JSON.parse(readFileSync(join(dist, url), 'utf8'));
  const embedded = map.sourcesContent?.filter((c) => typeof c === 'string').length ?? 0;
  if (embedded !== map.sources.length) errors.push(`dist/${url} must embed all sources (sourcesContent)`);
}

if (maps === 0) errors.push('no source maps emitted (tsdown `sourcemap` must stay enabled)');

for (const entry of ['index.js', 'react.js']) {
  try {
    await import(pathToFileURL(join(dist, entry)).href);
  } catch (error) {
    errors.push(`importing dist/${entry} without a DOM failed: ${error instanceof Error ? error.message : error}`);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`✖ ${e}`);
  process.exit(1);
}
console.log('✔ dist checks passed (use client directive, no top-level DOM access, SSR-safe imports, source maps)');
