import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // SDK ownership: product code must use the typed analytics boundary
  // (src/analytics). Only the approved analytics implementation files may
  // import the PostHog SDKs directly, so no product module can construct an
  // untyped or unsanitized capture, replay, or identity call. Enforced by
  // src/analytics/sdk-import-boundary.test.ts.
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    ignores: ["src/analytics/**", "instrumentation-client.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "posthog-js",
              message:
                "Import the client analytics boundary instead: @/src/analytics/client.",
            },
            {
              name: "posthog-node",
              message:
                "Import the server analytics boundary instead: @/src/analytics/server.",
            },
          ],
          patterns: [
            {
              group: ["posthog-js/*", "posthog-node/*"],
              message:
                "Import the analytics boundary instead: @/src/analytics/client or @/src/analytics/server.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "build/**",
    "coverage/**",
    "dist/**",
    "docs/design-reference/**",
    "node_modules/**",
  ]),
]);
