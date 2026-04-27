import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// envDir = parent so Vite reads the shared .env at restart-time/.env
// (only VITE_* prefixed vars are exposed to client code).
export default defineConfig({
  plugins: [react()],
  envDir: resolve(__dirname, '..'),
  server: {
    port: 5173,
    strictPort: true,
  },
});
