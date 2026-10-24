import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    react: 'src/react/index.ts',
    sunny: 'src/sunny.ts',
  },
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  dts: true,
  clean: true,
  // Linked source maps with embedded sources (sourcesContent): debuggable down to the original
  // TypeScript without shipping src/. They never reach a consumer's production bundle; bundlers
  // only read them when the consumer enables source maps (see CONTRIBUTING.md, "Source maps").
  sourcemap: true,
  plugins: [
    {
      // rolldown-plugin-dts drops the .d.ts.map files (they would point to the unshipped src/),
      // but the .d.ts chunks keep a dangling `//# sourceMappingURL` comment. Strip it.
      name: 'pagegeist:strip-dts-map-comment',
      generateBundle(_options, bundle) {
        for (const chunk of Object.values(bundle)) {
          if (chunk.type === 'chunk' && chunk.fileName.endsWith('.d.ts')) {
            chunk.code = chunk.code.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n');
          }
        }
      },
    },
  ],
  // react is an optional peer dependency and must never end up in the bundle.
  deps: { neverBundle: ['react', 'react/jsx-runtime'] },
  // Rolldown warns that module-level directives "may not be preserved" when bundling, but the
  // 'use client' directive of the React entry is kept at the top of dist/react.js.
  // scripts/check-dist.mjs (npm run check:dist) verifies that after every build.
  suppressWarnings: [/module level directive "use client"/],
  // Any other warning fails the build in CI.
  failOnWarn: 'ci-only',
});
