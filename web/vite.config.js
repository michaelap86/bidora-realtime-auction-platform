import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "../server/public", emptyOutDir: false, chunkSizeWarningLimit: 900 },
  server: { port: 5173, proxy: { "/api": "http://localhost:8130", "/uploads": "http://localhost:8130", "/socket.io": { target: "http://localhost:8130", ws: true } } },
});
