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
  // CI's stack job shares two cores among the Supabase stack, the
  // production server, and every browser instance; parallel workers
  // starve a renderer mid-journey (a wedged page answers nothing — no
  // navigation, no DOM access — and fails as a timeout). One worker at a
  // time keeps every journey's cookie jar, Web Lock, and RSC streams
  // intact; local runs keep the parallel default for speed.
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    deviceScaleFactor: 1,
    // Failure diagnostics (the CI database job uploads test-results/ when
    // the e2e step fails): a trace makes a hang or a timeout diagnosable
    // without a local repro. Retained only on failure to keep green runs
    // cheap.
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec next start --port 3100",
    url: "http://127.0.0.1:3100",
    // Never reuse whatever happens to be listening on port 3100: evidence must
    // come from the application built by this change, not a stale local server.
    reuseExistingServer: false,
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
