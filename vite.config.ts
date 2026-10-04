import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.PFX_BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@pfx/interaction-core": fileURLToPath(
        new URL("./vendor/PFx-Interaction-Core/packages/interaction-core/src/index.ts", import.meta.url),
      ),
      "@pfx/interaction-dom": fileURLToPath(
        new URL("./vendor/PFx-Interaction-Core/packages/interaction-dom/src/index.ts", import.meta.url),
      ),
      "@pfx/interaction-react": fileURLToPath(
        new URL("./vendor/PFx-Interaction-Core/packages/interaction-react/src/index.ts", import.meta.url),
      ),
    },
  },
});
