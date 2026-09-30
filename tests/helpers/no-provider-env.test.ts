import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getSupabasePublicConfig } from "../../src/supabase/config";

const fromTest = createRequire(import.meta.url);
const fromNext = createRequire(fromTest.resolve("next/package.json"));
const { loadEnvConfig } = fromNext("@next/env") as {
  loadEnvConfig: (
    dir: string,
    dev: boolean,
    logger?: unknown,
    forceReload?: boolean,
  ) => unknown;
};
const names = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AUTH_LINK_COOKIE_SECRET",
  "E2E_MAILPIT_URL",
  "E2E_LOCAL_SUPABASE",
  "E2E_WISHLIST_CONTROL_URL",
  "E2E_WISHLIST_CONTROL_TOKEN",
] as const;
describe("no-provider environment", () => {
  it("keeps explicitly empty provider and fixture variables empty despite dotenv contents", () => {
    const tempPath = mkdtempSync(join(tmpdir(), "arj28-no-provider-"));
    const prior = new Map(names.map((name) => [name, process.env[name]]));
    const priorProcessedEnv = process.env.__NEXT_PROCESSED_ENV;
    try {
      writeFileSync(
        join(tempPath, ".env"),
        names.map((name) => `${name}=synthetic-fixture-value`).join("\n") +
          "\n",
      );
      for (const name of names) process.env[name] = "";
      loadEnvConfig(tempPath, true, undefined, true);
      for (const name of names) expect(process.env[name]).toBe("");
      expect(getSupabasePublicConfig()).toBeNull();
    } finally {
      for (const name of names) {
        const value = prior.get(name);
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      if (priorProcessedEnv === undefined)
        delete process.env.__NEXT_PROCESSED_ENV;
      else process.env.__NEXT_PROCESSED_ENV = priorProcessedEnv;
      rmSync(tempPath, { recursive: true, force: true });
    }
  });
});
