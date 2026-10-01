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

const arj28States = [
  "add-initial",
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
const arj31States = [
  "add-initial",
  "add-initial-prefilled",
  "add-loading",
  "add-extracted-review",
  "add-validation",
  "add-partial-review",
  "add-manual-fallback",
  "wishlist-added-notice",
];
const viewports = ["mobile", "desktop"];
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const roots: string[] = [];
const HEAD_ENV = "CANDIDATE_IMPLEMENTATION_HEAD";
const ARJ28_FIXTURE = "synthetic ARJ-28 manual-entry fixture";
const ARJ31_FIXTURE = "synthetic ARJ-31 extraction-review fixture";

function writeSource(inputDir: string, prefix: string, states: string[]) {
  for (const state of states)
    for (const viewport of viewports)
      writeFileSync(join(inputDir, `${prefix}-${state}-${viewport}.png`), png);
  for (const viewport of viewports)
    writeFileSync(
      join(inputDir, `axe-${viewport}.json`),
      JSON.stringify({
        viewport,
        states: states.map((state) => ({ state, violationIds: [] })),
      }),
    );
}

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), `arj28-${randomUUID()}-`));
  roots.push(root);
  const arj28Dir = join(root, "test-results", "arj28-candidates");
  const arj31Dir = join(root, "test-results", "arj31-candidates");
  const outputDir = join(root, "evidence");
  mkdirSync(arj28Dir, { recursive: true });
  mkdirSync(arj31Dir, { recursive: true });
  writeSource(arj28Dir, "arj28", arj28States);
  writeSource(arj31Dir, "arj31", arj31States);
  return { root, arj28Dir, arj31Dir, outputDir };
}

afterEach(() => {
  delete process.env[HEAD_ENV];
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("ARJ-28 candidate collector", () => {
  it("exports both sources' matched PNGs with hashes and the checkout head", () => {
    const { arj28Dir, arj31Dir, outputDir } = sandbox();
    writeFileSync(join(arj28Dir, "auth-mobile.png"), "must not ship");
    writeFileSync(join(arj28Dir, "trace.zip"), "must not ship");
    writeFileSync(join(arj28Dir, "error-context.md"), "must not ship");
    const outside = join(tmpdir(), `arj28-outside-${randomUUID()}.png`);
    writeFileSync(outside, png);
    try {
      const manifest = collectCandidates({
        arj28Dir,
        arj31Dir,
        outputDir,
        repositoryRoot: process.cwd(),
      });
      const head = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      expect(manifest.implementationHead).toBe(head);
      expect(manifest.candidateCount).toBe(36);
      expect(manifest.candidates[0].sha256).toBe(
        createHash("sha256").update(png).digest("hex"),
      );
      expect(
        manifest.candidates.every(
          (candidate) => candidate.implementationHead === head,
        ),
      ).toBe(true);
      expect(
        manifest.candidates.filter(({ fixture }) => fixture === ARJ31_FIXTURE)
          .length,
      ).toBe(arj31States.length * viewports.length);
      expect(
        manifest.candidates.filter(({ fixture }) => fixture === ARJ28_FIXTURE)
          .length,
      ).toBe(arj28States.length * viewports.length);
      const manifestJson = readFileSync(
        join(outputDir, "manifest.json"),
        "utf8",
      );
      expect(manifestJson).not.toContain("must not ship");
      expect(manifestJson).not.toContain(outside);
      expect(manifestJson).not.toContain("auth-mobile");
      // Each source's axe evidence is carried under its own prefix.
      expect(manifest.axeReports.map(({ filename }) => filename)).toEqual([
        "axe-arj28-mobile.json",
        "axe-arj31-mobile.json",
        "axe-arj28-desktop.json",
        "axe-arj31-desktop.json",
      ]);
      for (const { filename } of manifest.axeReports)
        expect(readFileSync(join(outputDir, filename), "utf8")).toContain(
          '"violationIds":[]',
        );
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it("pins an explicitly provided implementation head at runtime", () => {
    const { arj28Dir, arj31Dir, outputDir } = sandbox();
    const pushedHead = "b".repeat(40);
    process.env[HEAD_ENV] = pushedHead;
    const manifest = collectCandidates({
      arj28Dir,
      arj31Dir,
      outputDir,
      repositoryRoot: process.cwd(),
    });
    expect(manifest.implementationHead).toBe(pushedHead);
    expect(
      manifest.candidates.every(
        (candidate) => candidate.implementationHead === pushedHead,
      ),
    ).toBe(true);
  });

  it("rejects an implementation head override that is not a full SHA", () => {
    const { arj28Dir, arj31Dir, outputDir } = sandbox();
    process.env[HEAD_ENV] = "b2f876b";
    expect(() => collectCandidates({ arj28Dir, arj31Dir, outputDir })).toThrow(
      "not a full commit SHA",
    );
  });

  it("fails closed on invalid PNGs, duplicate candidates, missing states, and symlinks", () => {
    const invalid = sandbox();
    writeFileSync(
      join(invalid.arj28Dir, "arj28-manual-clean-mobile.png"),
      "not a png",
    );
    expect(() =>
      collectCandidates({
        arj28Dir: invalid.arj28Dir,
        arj31Dir: invalid.arj31Dir,
        outputDir: invalid.outputDir,
      }),
    ).toThrow("not a PNG");

    const missing = sandbox();
    rmSync(join(missing.arj28Dir, "arj28-success-desktop.png"));
    expect(() =>
      collectCandidates({
        arj28Dir: missing.arj28Dir,
        arj31Dir: missing.arj31Dir,
        outputDir: missing.outputDir,
      }),
    ).toThrow("missing a state or viewport");

    const missingExtract = sandbox();
    rmSync(
      join(missingExtract.arj31Dir, "arj31-add-manual-fallback-mobile.png"),
    );
    expect(() =>
      collectCandidates({
        arj28Dir: missingExtract.arj28Dir,
        arj31Dir: missingExtract.arj31Dir,
        outputDir: missingExtract.outputDir,
      }),
    ).toThrow("missing a state or viewport");

    const links = sandbox();
    const outside = join(links.root, "outside.png");
    writeFileSync(outside, png);
    symlinkSync(outside, join(links.arj31Dir, "decoy.png"));
    expect(() =>
      collectCandidates({
        arj28Dir: links.arj28Dir,
        arj31Dir: links.arj31Dir,
        outputDir: links.outputDir,
      }),
    ).toThrow("symlinks");
  });

  it("rejects axe reports with any violations", () => {
    const axe = sandbox();
    writeFileSync(
      join(axe.arj28Dir, "axe-mobile.json"),
      JSON.stringify({
        viewport: "mobile",
        states: arj28States.map((state, index) => ({
          state,
          violationIds: index === 0 ? ["color-contrast"] : [],
        })),
      }),
    );
    expect(() =>
      collectCandidates({
        arj28Dir: axe.arj28Dir,
        arj31Dir: axe.arj31Dir,
        outputDir: axe.outputDir,
      }),
    ).toThrow("contains violations");
  });
});
