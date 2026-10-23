import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Playground dev server/build. The library itself is built with tsdown. */
export default defineConfig({
  root: 'playground',
  base: './',
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@d4ndel1on/pagegeist/react', replacement: src('./src/react/index.ts') },
      { find: '@d4ndel1on/pagegeist', replacement: src('./src/index.ts') },
    ],
  },
  build: {
    outDir: '../dist-playground',
    emptyOutDir: true,
  },
});
