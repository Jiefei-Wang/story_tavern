import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { repositoryConfigPlugin } from './scripts/repository-config-plugin';
import { localServicePlugin } from './scripts/local-service-plugin';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [repositoryConfigPlugin(), react(), localServicePlugin()],
  define: { 'import.meta.env.VITE_SHARED_STORAGE': JSON.stringify('true') },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: { host: '127.0.0.1' },
  // Secrets belong to Rust, never to the browser bundle.
  envPrefix: ["VITE_PUBLIC_", "TAURI_"],
});
