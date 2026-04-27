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
    // Bind to 0.0.0.0 so the dev server is reachable over the Tailnet
    // (Restart Time on phone → http://<laptop-tailnet-ip>:5173).
    host: true,
  },
});
