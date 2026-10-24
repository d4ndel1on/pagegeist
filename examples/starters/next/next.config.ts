import type { NextConfig } from 'next';

// This starter lives inside the pagegeist repository: keep Next.js from treating the
// repository root (which has its own lockfile) as the workspace root.
const config: NextConfig = { turbopack: { root: __dirname } };

export default config;
