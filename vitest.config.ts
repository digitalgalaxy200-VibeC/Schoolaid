import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest executes the pure logic modules directly, outside Next.js, so the `@/*`
 * path alias declared in tsconfig.json must be repeated here. Without it, any
 * test that imports application code (rather than a self-contained module) fails
 * to resolve `@/...` — while `tsc` and `next build` are perfectly happy, which
 * makes the failure look like a broken test rather than a missing alias.
 *
 * Only the alias is configured; discovery uses vitest's defaults.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
