import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectDirectory = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('./dashboard', import.meta.url)),
  envDir: projectDirectory,
  build: {
    outDir: fileURLToPath(new URL('./dist/portal', import.meta.url)),
    emptyOutDir: true
  }
});
