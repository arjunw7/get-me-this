import { defineConfig } from "@playwright/test";

/**
 * End-to-end, accessibility, and visual-regression configuration.
 *
 * Viewports are the two approved by the design contract (DESIGN.md):
 * mobile 390x844 and desktop 1440x1000. Chromium only; a browser matrix is
 * an explicit non-goal of this issue.
 *
 * Specs are executed through explicit paths so the two suites stay separate:
 *   pnpm test:e2e    -> playwright test tests/e2e
 *   pnpm test:visual -> playwright test tests/visual
 *
 * The web server is the production build (built by the package scripts), not
 * `next dev`, so the dev overlay and HMR never leak into evidence. Port 3100
 * avoids colliding with a developer's `pnpm dev` instance on 3000.
 */
export default defineConfig({
  testDir: "tests",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    // Screenshot baselines live together in one reviewable directory guarded
    // by tests/visual/baselines/BASELINE-MANIFEST.json. The approved viewport
    // is part of the name (set in the spec), so each project gets its own
    // baseline file.
    toHaveScreenshot: {
      pathTemplate: "tests/visual/baselines/{arg}{ext}",
    },
  },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    deviceScaleFactor: 1,
  },
  webServer: {
    command: "pnpm exec next start --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 1000 } },
    },
  ],
});
