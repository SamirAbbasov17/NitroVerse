import { defineConfig } from 'vite';

// Nisbi yollarla build (istənilən qovluqdan açıla bilsin)
export default defineConfig({
  base: './',
  server: {
    open: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
