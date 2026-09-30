import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
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

function runCollector(input: string, output: string) {
  const script = fileURLToPath(
    new URL("../scripts/collect-wishlist-visual-evidence.mjs", import.meta.url),
  );
  return spawnSync(process.execPath, [script, input, output], {
    encoding: "utf8",
  });
}

it("copies all eight actual/diff PNGs from Playwright's four pinned visual result directories", () => {
  const root = mkdtempSync(join(tmpdir(), "wishlist-images-"));
  roots.push(root);
  const input = join(root, "test-results");
  const output = join(root, "safe-images");
  const runs = [
    [
      "visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-mobile",
      "wishlist-empty-mobile",
    ],
    [
      "visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-mobile",
      "wishlist-filled-mobile",
    ],
    [
      "visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-desktop",
      "wishlist-empty-desktop",
    ],
    [
      "visual-wishlist-filled.vis-24b41-nned-V18-filled-composition-desktop",
      "wishlist-filled-desktop",
    ],
  ] as const;
  for (const [runDirectory, imageStem] of runs) {
    const directory = join(input, runDirectory);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${imageStem}-actual.png`), "safe image");
    writeFileSync(join(directory, `${imageStem}-diff.png`), "safe diff");
  }

  const empty = join(input, runs[0][0]);
  const other = join(input, "auth-email.visual-login-mobile");
  mkdirSync(other, { recursive: true });
  writeFileSync(join(empty, "error-context.md"), "invented OTP 123456");
  writeFileSync(join(empty, "trace.zip"), "private trace");
  writeFileSync(join(empty, "report.html"), "private report");
  writeFileSync(join(other, "wishlist-empty-mobile-actual.png"), "wrong suite");
  writeFileSync(join(other, "auth-mobile-actual.png"), "auth screenshot");
  writeFileSync(
    join(empty, "wishlist-filled-mobile-actual.png"),
    "wrong state",
  );
  writeFileSync(
    join(empty, "wishlist-empty-desktop-actual.png"),
    "wrong viewport",
  );
  const spoof = join(
    input,
    "visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-mobile-spoof",
  );
  mkdirSync(spoof);
  writeFileSync(join(spoof, "wishlist-empty-mobile-actual.png"), "spoof");
  const nested = join(empty, "nested");
  mkdirSync(nested);
  writeFileSync(join(nested, "wishlist-empty-mobile-diff.png"), "nested");

  const result = runCollector(input, output);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("8 allowlisted PNGs");
  expect(result.stdout + result.stderr).not.toContain("123456");
  expect(readdirSync(output).sort()).toEqual([
    "wishlist-empty-desktop-actual.png",
    "wishlist-empty-desktop-diff.png",
    "wishlist-empty-mobile-actual.png",
    "wishlist-empty-mobile-diff.png",
    "wishlist-filled-desktop-actual.png",
    "wishlist-filled-desktop-diff.png",
    "wishlist-filled-mobile-actual.png",
    "wishlist-filled-mobile-diff.png",
  ]);
  for (const name of readdirSync(output)) {
    expect(readFileSync(join(output, name), "utf8")).toBe(
      name.endsWith("-actual.png") ? "safe image" : "safe diff",
    );
  }
});

it("does not copy an allowed PNG name when the source is a symlink", () => {
  const root = mkdtempSync(join(tmpdir(), "wishlist-images-"));
  roots.push(root);
  const input = join(root, "test-results");
  const output = join(root, "safe-images");
  const directory = join(
    input,
    "visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition-mobile",
  );
  mkdirSync(directory, { recursive: true });
  const outside = join(root, "outside.png");
  writeFileSync(outside, "not a runner screenshot");
  symlinkSync(outside, join(directory, "wishlist-empty-mobile-actual.png"));

  const result = runCollector(input, output);
  expect(result.status).toBe(0);
  expect(readdirSync(output)).toEqual([]);
});
