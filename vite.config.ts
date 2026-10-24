import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** Sources of llms-full.txt, most useful for agents first. */
const LLMS_FULL = [
  'docs/usage-for-agents.md',
  'README.md',
  'docs/api.md',
  'docs/guide.md',
  'docs/accessibility.md',
  'docs/recipes.md',
  'docs/faq.md',
  'docs/character.md',
];
const BLOB = 'https://github.com/d4ndel1on/pagegeist/blob/main/';

/** Emits llms-full.txt (all docs in one file, relative links made absolute) next to llms.txt. */
function llmsFull(): Plugin {
  return {
    name: 'llms-full',
    apply: 'build',
    generateBundle() {
      const parts = LLMS_FULL.map((file) => {
        const text = readFileSync(src(`./${file}`), 'utf8')
          .replace(/<!-- snippet: \S+ -->\n/g, '')
          .replace(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (_, link: string) => {
            return `](${BLOB}${posix.normalize(posix.join(posix.dirname(file), link))})`;
          });
        return `<!-- Source: ${BLOB}${file} -->\n\n${text.trim()}\n`;
      });
      const header =
        '# pagegeist – full documentation\n\n' +
        '> All docs of @d4ndel1on/pagegeist in one file. Start with "Usage for agents".\n';
      this.emitFile({ type: 'asset', fileName: 'llms-full.txt', source: [header, ...parts].join('\n---\n\n') });
    },
  };
}

/** Playground dev server/build. The library itself is built with tsdown. */
export default defineConfig({
  root: 'playground',
  base: './',
  plugins: [react(), llmsFull()],
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
