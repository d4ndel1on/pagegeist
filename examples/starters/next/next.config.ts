import type { NextConfig } from 'next';

// This starter lives inside the pagegeist repository: keep Next.js from treating the
// repository root (which has its own lockfile) as the workspace root. process.cwd() rather
// than __dirname: the config is loaded as an ES module in some environments (e.g. StackBlitz).
const config: NextConfig = { turbopack: { root: process.cwd() } };

export default config;
