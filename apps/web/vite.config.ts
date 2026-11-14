import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development, forward /api/* to the NestJS API so the browser sees a
    // single origin (no CORS setup needed). `fetch("/api/projects")` just works.
    proxy: {
      "/api": "http://localhost:3000"
    }
  }
});
