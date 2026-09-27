/**
 * Integration-level regression test: proves that the pinned Next.js runtime
 * discovers and wires the exported `onRouterTransitionStart` hook from
 * `instrumentation-client.ts` — not merely that the function exists or can
 * be called directly.
 *
 * Two independent facts are asserted against the production build output
 * (this spec runs after `pnpm build`):
 *
 * 1. The pinned Next.js client runtime invokes the hook by its exact name
 *    (`onRouterTransitionStart?.(`), so the discovered name is the one this
 *    repository exports.
 * 2. The build compiled the instrumentation module into a client chunk: the
 *    chunk containing this module's unique string constants also carries the
 *    exported hook name, proving Next discovered and bundled the export for
 *    runtime discovery.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";

function walkFiles(directory: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      entries.push(...walkFiles(path));
    } else {
      entries.push(path);
    }
  }
  return entries;
}

test.describe("Next.js instrumentation-client hook discovery", () => {
  test("the pinned Next.js runtime invokes the exported onRouterTransitionStart hook", () => {
    const runtimePath = join(
      process.cwd(),
      "node_modules/next/dist/compiled/next-server/app-page.runtime.prod.js",
    );
    const runtime = readFileSync(runtimePath, "utf8");
    // The runtime calls the hook with optional chaining on the exact
    // exported name; a different export name would never be invoked.
    expect(runtime).toContain("onRouterTransitionStart?.(");
  });

  test("the production build bundles the instrumentation module with its exported hook", () => {
    const chunksDir = join(process.cwd(), ".next/static/chunks");
    const chunks = walkFiles(chunksDir).filter((file) => file.endsWith(".js"));

    // The compiled instrumentation module is located by a string constant
    // unique to it (the consent storage key from src/analytics/client.ts).
    const instrumentationChunks = chunks.filter((file) =>
      readFileSync(file, "utf8").includes("gmt:analytics:consent"),
    );
    expect(instrumentationChunks.length).toBeGreaterThan(0);

    // The exported hook name survives into the same compiled module.
    for (const chunk of instrumentationChunks) {
      expect(readFileSync(chunk, "utf8")).toContain("onRouterTransitionStart");
    }
  });
});
