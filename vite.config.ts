import { existsSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Use a sibling SDK checkout when present, so local SDK changes hot reload.
// Otherwise, the installed npm package is used.
const localSdk = path.resolve(
  import.meta.dirname,
  "../runelink-sdk-js/src/index.ts"
);
const useLocalSdk = existsSync(localSdk);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      ...(useLocalSdk && { "@runelink/sdk": localSdk }),
    },
    // Keep one effect instance when SDK source resolves from the sibling
    // checkout.
    dedupe: ["effect"],
  },
});
