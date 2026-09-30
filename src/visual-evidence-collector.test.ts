import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

it("copies only named wishlist actual/diff PNGs from wishlist visual results", () => {
  const root = mkdtempSync(join(tmpdir(), "wishlist-images-"));
  roots.push(root);
  const input = join(root, "test-results");
  const output = join(root, "safe-images");
  const empty = join(input, "wishlist-empty.visual-the-signed-in-empty-mobile");
  const other = join(input, "auth-email.visual-login-mobile");
  mkdirSync(empty, { recursive: true });
  mkdirSync(other, { recursive: true });
  writeFileSync(join(empty, "wishlist-empty-mobile-actual.png"), "safe image");
  writeFileSync(join(empty, "wishlist-empty-mobile-diff.png"), "safe diff");
  writeFileSync(join(empty, "error-context.md"), "invented OTP 123456");
  writeFileSync(join(empty, "trace.zip"), "private trace");
  writeFileSync(join(other, "wishlist-empty-mobile-actual.png"), "wrong suite");
  writeFileSync(join(other, "auth-mobile-actual.png"), "auth screenshot");

  const script = fileURLToPath(
    new URL("../scripts/collect-wishlist-visual-evidence.mjs", import.meta.url),
  );
  const result = spawnSync(process.execPath, [script, input, output], {
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout + result.stderr).not.toContain("123456");
  expect(readdirSync(output).sort()).toEqual([
    "wishlist-empty-mobile-actual.png",
    "wishlist-empty-mobile-diff.png",
  ]);
});
