import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { collectCandidates } from "../scripts/collect-arj28-candidates.mjs";

const states = [
  "manual-prefilled",
  "manual-clean",
  "validation",
  "submission-conflict",
  "save-failure",
  "edit",
  "delete-confirm",
  "delete-uncertain",
  "success",
];
const viewports = ["mobile", "desktop"];
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const roots: string[] = [];

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), `arj28-${randomUUID()}-`));
  roots.push(root);
  const inputDir = join(root, "test-results", "arj28-candidates");
  const outputDir = join(root, "evidence");
  mkdirSync(inputDir, { recursive: true });
  for (const state of states)
    for (const viewport of viewports)
      writeFileSync(join(inputDir, `arj28-${state}-${viewport}.png`), png);
  for (const viewport of viewports)
    writeFileSync(
      join(inputDir, `axe-${viewport}.json`),
      JSON.stringify({
        viewport,
        states: states.map((state) => ({ state, violationIds: [] })),
      }),
    );
  return { root, inputDir, outputDir };
}

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("ARJ-28 candidate collector", () => {
  it("exports only matched PNGs with hashes and exact implementation head", () => {
    const { inputDir, outputDir } = sandbox();
    writeFileSync(join(inputDir, "auth-mobile.png"), "must not ship");
    writeFileSync(join(inputDir, "trace.zip"), "must not ship");
    writeFileSync(join(inputDir, "error-context.md"), "must not ship");
    const outside = join(tmpdir(), `arj28-outside-${randomUUID()}.png`);
    writeFileSync(outside, png);
    try {
      const manifest = collectCandidates({
        inputDir,
        outputDir,
        repositoryRoot: process.cwd(),
      });
      const head = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      expect(manifest.implementationHead).toBe(head);
      expect(manifest.candidateCount).toBe(18);
      expect(manifest.candidates[0].sha256).toBe(
        createHash("sha256").update(png).digest("hex"),
      );
      expect(
        manifest.candidates.every(
          (candidate) => candidate.implementationHead === head,
        ),
      ).toBe(true);
      const files = readFileSync(join(outputDir, "manifest.json"), "utf8");
      expect(files).not.toContain("must not ship");
      expect(files).not.toContain(outside);
      expect(files).not.toContain("auth-mobile");
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it("fails closed on invalid PNGs, duplicate candidates, missing states, and symlinks", () => {
    const invalid = sandbox();
    writeFileSync(
      join(invalid.inputDir, "arj28-manual-clean-mobile.png"),
      "not a png",
    );
    expect(() => collectCandidates(invalid)).toThrow("not a PNG");

    const missing = sandbox();
    rmSync(join(missing.inputDir, "arj28-success-desktop.png"));
    expect(() => collectCandidates(missing)).toThrow(
      "missing a state or viewport",
    );

    const links = sandbox();
    const outside = join(links.root, "outside.png");
    writeFileSync(outside, png);
    symlinkSync(outside, join(links.inputDir, "decoy.png"));
    expect(() => collectCandidates(links)).toThrow("symlinks");
  });

  it("rejects axe reports with any violations", () => {
    const axe = sandbox();
    writeFileSync(
      join(axe.inputDir, "axe-mobile.json"),
      JSON.stringify({
        viewport: "mobile",
        states: states.map((state, index) => ({
          state,
          violationIds: index === 0 ? ["color-contrast"] : [],
        })),
      }),
    );
    expect(() => collectCandidates(axe)).toThrow("contains violations");
  });
});
