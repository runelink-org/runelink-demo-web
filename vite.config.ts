import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@runelink/sdk": path.resolve(
        import.meta.dirname,
        "./vendor/runelink-sdk-js/src/index.ts"
      ),
    },
  },
});
