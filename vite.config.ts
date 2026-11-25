import react from "@vitejs/plugin-react";
// `vitest/config`'s defineConfig is vite's plus the `test` field (same pattern as domus).
import { defineConfig } from "vitest/config";

import { dataApiPlugin } from "./server/data-plugin";
import { PUBLIC_MODE } from "./src/mode";

export default defineConfig(({ mode }) => ({
  plugins: [react(), dataApiPlugin()],
  // A literal at every use site, so the minifier can drop public-build branches. Comparing
  // import.meta.env.MODE against an imported constant does NOT fold: the minifier does not
  // propagate constants across modules, and the review UI survived in the bundle.
  define: { "import.meta.env.PUBLIC_BUILD": JSON.stringify(mode === PUBLIC_MODE) },
  server: {
    port: 3006,
    host: true,
    allowedHosts: true,
    // The data API writes back into data/*.json on every review click — keep those writes
    // (and doc edits) from churning the dev server's watcher.
    watch: {
      ignored: ["**/data/**", "**/*.md", "**/*.log"],
    },
  },
  // Pure record logic only — no DOM needed.
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "server/**/*.{test,spec}.ts", "scripts/**/*.test.mjs"],
  },
}));
