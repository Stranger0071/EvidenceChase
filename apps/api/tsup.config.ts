import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The shared package ships TypeScript source, so it's bundled into the build. Everything else
  // stays a normal runtime dependency.
  noExternal: ['@evidencechase/shared'],
});
