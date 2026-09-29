import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['src/lib/vectorizacion/svgSplit.test.ts', 'jsdom'],
      ['src/lib/centro/markdown.test.ts', 'jsdom'],
    ],
  },
});
