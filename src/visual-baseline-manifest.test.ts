import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guard for the committed visual baselines.
 *
 * tests/visual/baselines/BASELINE-MANIFEST.json records the SHA-256 of every
 * committed screenshot together with the human approval that accepted it.
 * This test fails when any committed baseline changes without the manifest
 * being updated, or when a manifest is committed without recorded approval.
 *
 * The guard applies only to baselines that are committed to git. Candidate
 * screenshots generated with --update-snapshots await human approval and are
 * intentionally invisible to this guard until they are committed together
 * with an approved manifest.
 *
 * The manifest improves review visibility; it is not an authorization
 * mechanism. A baseline change must still be approved by a human in the
 * pull request, per AGENTS.md and docs/delivery/visual-baselines.md.
 */

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const baselinesDir = join(repositoryRoot, "tests", "visual", "baselines");
const manifestPath = join(baselinesDir, "BASELINE-MANIFEST.json");

/** Baseline PNGs currently tracked by git, relative to the baselines dir. */
function committedBaselines(): readonly string[] {
  try {
    const output = execSync("git ls-files -- tests/visual/baselines", {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.endsWith(".png"))
      .map((line) => line.replace("tests/visual/baselines/", ""));
  } catch {
    return []; // Not a git checkout; there is nothing committed to guard.
  }
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("visual baseline manifest", () => {
  const committed = committedBaselines();

  it("records every committed baseline with a matching hash", () => {
    if (committed.length === 0) {
      return; // No committed baselines yet; nothing to guard.
    }

    expect(
      existsSync(manifestPath),
      "committed baselines require BASELINE-MANIFEST.json",
    ).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      files: Record<string, string>;
    };

    expect(new Set(Object.keys(manifest.files))).toEqual(new Set(committed));

    for (const entry of committed) {
      const recordedHash = manifest.files[entry];
      expect(typeof recordedHash, `${entry} is not hashed`).toBe("string");
      expect(sha256(join(baselinesDir, entry))).toBe(recordedHash);
    }
  });

  it("records human approval before baselines can be committed", () => {
    if (committed.length === 0) {
      return; // No committed baselines yet; nothing to guard.
    }

    expect(
      existsSync(manifestPath),
      "committed baselines require BASELINE-MANIFEST.json",
    ).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      approvedBy: unknown;
      approvedDate: unknown;
    };

    // approvedBy is filled by the human reviewer, never by an agent.
    expect(typeof manifest.approvedBy).toBe("string");
    expect(String(manifest.approvedBy).length).toBeGreaterThan(0);
    expect(typeof manifest.approvedDate).toBe("string");
    expect(String(manifest.approvedDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
