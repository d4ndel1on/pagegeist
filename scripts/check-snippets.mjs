#!/usr/bin/env node
// Keeps copy-paste snippets in the docs from rotting:
// 1. A fenced code block preceded by `<!-- snippet: examples/x.tsx -->` must match that file
//    exactly. The files in examples/ are type-checked and linted with the rest of the repo.
// 2. The starter apps in examples/starters/ contain verbatim copies of some examples.
// 3. Pinned CDN URLs (esm.sh/@d4ndel1on/pagegeist@x.y.z) must name the current version.
// `--fix` rewrites the docs and copies instead of failing (run by `npm run version-packages`).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const fix = process.argv.includes('--fix');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const docs = [
  'README.md',
  ...readdirSync(join(root, 'docs'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/${f}`),
  'playground/public/llms.txt',
];

/** Starter app file → the example it must be a verbatim copy of. */
const COPIES = {
  'examples/starters/next/app/layout.tsx': 'examples/next-app-layout.tsx',
  'examples/starters/react/src/Layout.tsx': 'examples/react.tsx',
  'examples/starters/vite/src/main.ts': 'examples/vite-main.ts',
};

const SNIPPET = /(<!-- snippet: (\S+) -->\n```\w*\n)([\s\S]*?)(```)/g;
const CDN = /(esm\.sh\/@d4ndel1on\/pagegeist@)(\d+\.\d+\.\d+[\w.-]*)/g;

const errors = [];
let snippets = 0;
for (const doc of docs) {
  const original = readFileSync(join(root, doc), 'utf8');
  const text = original
    .replace(SNIPPET, (match, head, file, body, fence) => {
      snippets++;
      let expected;
      try {
        expected = readFileSync(join(root, file), 'utf8');
      } catch {
        errors.push(`${doc}: snippet source ${file} does not exist`);
        return match;
      }
      if (body === expected) return match;
      if (!fix) errors.push(`${doc}: snippet differs from ${file}`);
      return head + expected + fence;
    })
    .replace(CDN, (match, prefix, pinned) => {
      if (pinned === version) return match;
      if (!fix) errors.push(`${doc}: CDN URL pins ${pinned}, package.json is ${version}`);
      return prefix + version;
    });
  if (fix && text !== original) {
    writeFileSync(join(root, doc), text);
    console.log(`updated ${doc}`);
  }
}

for (const [copy, source] of Object.entries(COPIES)) {
  const expected = readFileSync(join(root, source), 'utf8');
  if (readFileSync(join(root, copy), 'utf8') === expected) continue;
  if (!fix) errors.push(`${copy} differs from ${source}`);
  else {
    writeFileSync(join(root, copy), expected);
    console.log(`updated ${copy}`);
  }
}

if (errors.length) {
  console.error(`${errors.map((e) => `✖ ${e}`).join('\n')}\nRun \`node scripts/check-snippets.mjs --fix\` to update.`);
  process.exit(1);
}
console.log(
  `✔ ${snippets} snippets and ${Object.keys(COPIES).length} starter files match examples/, CDN pins match ${version}`,
);
