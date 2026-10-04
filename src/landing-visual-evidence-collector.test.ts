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
import { expect, it } from "vitest";

it("exports only the four pinned public landing PNGs, excluding auth material and spoofed paths", () => {
  const root = mkdtempSync(join(tmpdir(), "landing-images-"));
  try {
    const input = join(root, "test-results");
    const output = join(root, "safe-images");
    const prefix = "visual-landing.visual-landing-page-is-visually-stable";
    for (const viewport of ["mobile", "desktop"]) {
      const directory = join(input, `${prefix}-${viewport}`);
      mkdirSync(directory, { recursive: true });
      for (const kind of ["actual", "diff"]) {
        writeFileSync(
          join(directory, `landing-${viewport}-${kind}.png`),
          "public screenshot",
        );
      }
      writeFileSync(join(directory, "trace.zip"), "invented private trace");
      writeFileSync(join(directory, "error-context.md"), "invented OTP 123456");
      writeFileSync(
        join(directory, "landing-mobile-expected.png"),
        "old baseline",
      );
      writeFileSync(
        join(directory, "auth-mobile-actual.png"),
        "private screenshot",
      );
    }
    for (const directory of [
      "auth-login-mobile",
      `${prefix}-mobile-spoof`,
      `${prefix}-mobile/nested`,
    ]) {
      mkdirSync(join(input, directory), { recursive: true });
      writeFileSync(
        join(input, directory, "landing-mobile-actual.png"),
        "wrong suite",
      );
    }
    writeFileSync(
      join(input, `${prefix}-desktop`, "landing-mobile-actual.png"),
      "wrong viewport",
    );
    const outside = join(root, "outside");
    mkdirSync(outside);
    writeFileSync(
      join(outside, "landing-mobile-actual.png"),
      "symlink content",
    );
    symlinkSync(outside, join(input, "linked-suite"));
    symlinkSync(
      join(outside, "landing-mobile-actual.png"),
      join(input, `${prefix}-mobile`, "landing-mobile-linked.png"),
    );
    const script = fileURLToPath(
      new URL(
        "../scripts/collect-landing-visual-evidence.mjs",
        import.meta.url,
      ),
    );
    const result = spawnSync(process.execPath, [script, input, output], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("4 allowlisted PNGs");
    expect(result.stdout + result.stderr).not.toContain("123456");
    expect(readdirSync(output).sort()).toEqual([
      "landing-desktop-actual.png",
      "landing-desktop-diff.png",
      "landing-mobile-actual.png",
      "landing-mobile-diff.png",
    ]);
    for (const name of readdirSync(output))
      expect(readFileSync(join(output, name), "utf8")).toBe(
        "public screenshot",
      );
    // Even an otherwise valid evidence filename must not follow a symlink.
    const allowedImage = join(
      input,
      `${prefix}-mobile`,
      "landing-mobile-actual.png",
    );
    rmSync(allowedImage);
    symlinkSync(join(outside, "landing-mobile-actual.png"), allowedImage);
    const linkedOutput = join(root, "without-links");
    const linkedResult = spawnSync(
      process.execPath,
      [script, input, linkedOutput],
      { encoding: "utf8" },
    );
    expect(linkedResult.status).toBe(0);
    expect(readdirSync(linkedOutput)).not.toContain(
      "landing-mobile-actual.png",
    );
    expect(readdirSync(linkedOutput)).toHaveLength(3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
