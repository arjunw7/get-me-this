import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit and component tests.
 *
 * The default environment is Node: the existing filesystem-based tests
 * (tokens, styles, fixture) read real files and must not inherit a DOM.
 * Component tests opt into jsdom explicitly with a `@vitest-environment jsdom`
 * docblock at the top of each *.test.tsx file.
 * TSX transforms through vitest's esbuild using the tsconfig "react-jsx"
 * runtime, so no React plugin is needed.
 * Playwright specs under tests/e2e and tests/visual are excluded; they run
 * through `pnpm test:e2e` and `pnpm test:visual`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/helpers/*.test.ts"],
    setupFiles: ["tests/setup/vitest-setup.ts"],
  },
});
