import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // Agent worktrees live under .claude/; watching their build output crashes the dev server on Windows.
    watch: { ignored: ['**/.claude/**'] },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    clearMocks: true,
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
});
