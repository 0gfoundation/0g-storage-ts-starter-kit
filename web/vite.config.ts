import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';

const fsStub = path.resolve(__dirname, 'src/stubs/fs.ts');
const fsPromisesStub = path.resolve(__dirname, 'src/stubs/fs-promises.ts');

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['crypto', 'buffer', 'stream', 'util', 'events', 'path'],
      globals: { Buffer: true, process: true },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: [
      // fs stubs — more specific paths first
      { find: 'node:fs/promises', replacement: fsPromisesStub },
      { find: 'node:fs', replacement: fsStub },
      { find: /^fs$/, replacement: fsStub },
    ],
  },
  build: {
    target: 'esnext',
  },
});
