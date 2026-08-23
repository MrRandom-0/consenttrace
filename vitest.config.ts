import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@/': r('./apps/web/src/') as unknown as string,
      '@consenttrace/shared': r('./packages/shared/src/index.ts'),
      '@consenttrace/validation': r('./packages/validation/src/index.ts'),
      '@consenttrace/scanner-core': r('./packages/scanner-core/src/index.ts'),
      '@consenttrace/rule-engine': r('./packages/rule-engine/src/index.ts'),
      '@consenttrace/evidence': r('./packages/evidence/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
