#!/usr/bin/env node
// Installs the packed tarball (exactly what `npm publish` would upload) into the starter apps in
// examples/starters/ and builds them, so the browser tests in e2e/starters.spec.ts exercise the
// real artifact in a real Next.js and Vite setup – not the source files via path aliases.
// Run `npm run build` first. The starters keep depending on the npm release in their own
// package.json (they double as StackBlitz demos); the tarball is installed with --no-save.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const starters = join(root, 'examples/starters');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (cwd, ...args) => execFileSync(npm, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });

const dest = mkdtempSync(join(tmpdir(), 'pagegeist-pack-'));
const [{ filename }] = JSON.parse(run(root, 'pack', '--json', '--pack-destination', dest));
const tarball = join(dest, filename);
console.log(`packed ${tarball}`);

for (const name of readdirSync(starters, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const dir = join(starters, name.name);
  console.log(`\n▸ ${name.name}`);
  run(dir, 'ci', '--ignore-scripts', '--no-audit', '--no-fund');
  run(dir, 'install', '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', tarball);

  // Guard against silently testing the registry version: the installed bundle must be ours.
  const installed = join(dir, 'node_modules/@d4ndel1on/pagegeist/dist');
  for (const file of readdirSync(join(root, 'dist'))) {
    if (!readFileSync(join(installed, file)).equals(readFileSync(join(root, 'dist', file)))) {
      throw new Error(`${name.name}: node_modules/@d4ndel1on/pagegeist/dist/${file} differs from dist/`);
    }
  }
  process.stdout.write(run(dir, 'run', 'build'));
}
