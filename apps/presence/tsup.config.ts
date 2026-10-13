import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The protocol package ships TypeScript source, so it is bundled in.
  // Everything from npm stays external and is installed at runtime.
  noExternal: [/^@rustbuilderz\//],
});
