import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

const STATES = [
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
const VIEWPORTS = ["mobile", "desktop"];
// Derived from STATES so the accepted filenames cannot drift from the
// validated state list.
const IMAGE_NAME = new RegExp(
  `^arj28-(${STATES.join("|")})-(mobile|desktop)\\.png$`,
);
const AXE_NAME = /^axe-(mobile|desktop)\.json$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function manifestEntry(filename, bytes, head, state, viewport, fixture) {
  return {
    filename,
    sha256: digest(bytes),
    implementationHead: head,
    state,
    viewport,
    fixture,
  };
}

export function collectCandidates({
  inputDir,
  outputDir,
  repositoryRoot = process.cwd(),
}) {
  const rootInfo = lstatSync(inputDir);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error("candidate source must be a regular directory");
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(head))
    throw new Error("unable to resolve implementation head");
  mkdirSync(outputDir, { recursive: false });
  const outputEntries = readdirSync(outputDir);
  if (outputEntries.length)
    throw new Error("candidate export destination must be empty");
  const entries = readdirSync(inputDir, { withFileTypes: true });
  const byKey = new Map();
  const files = [];
  const axeReports = new Map();
  for (const entry of entries) {
    const source = join(inputDir, entry.name);
    const info = lstatSync(source);
    if (info.isSymbolicLink())
      throw new Error("candidate directories cannot contain symlinks");
    if (!info.isFile()) continue;
    const image = entry.name.match(IMAGE_NAME);
    if (image) {
      const [, state, viewport] = image;
      const key = `${state}:${viewport}`;
      if (byKey.has(key))
        throw new Error("duplicate candidate state and viewport");
      const bytes = readFileSync(source);
      if (
        bytes.length < PNG_SIGNATURE.length ||
        !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
      )
        throw new Error("candidate is not a PNG");
      copyFileSync(source, join(outputDir, entry.name));
      const fixture = "synthetic ARJ-28 manual-entry fixture";
      const item = manifestEntry(
        entry.name,
        bytes,
        head,
        state,
        viewport,
        fixture,
      );
      byKey.set(key, item);
      files.push(item);
      continue;
    }
    const axe = entry.name.match(AXE_NAME);
    if (axe) {
      const viewport = axe[1];
      if (axeReports.has(viewport)) throw new Error("duplicate axe report");
      const report = JSON.parse(readFileSync(source, "utf8"));
      if (
        report.viewport !== viewport ||
        !Array.isArray(report.states) ||
        report.states.length !== STATES.length
      )
        throw new Error("invalid axe report");
      if (
        report.states.some(
          (state) =>
            !STATES.includes(state.state) ||
            !Array.isArray(state.violationIds) ||
            state.violationIds.length,
        )
      )
        throw new Error("axe report contains violations or unknown states");
      axeReports.set(viewport, report);
      copyFileSync(source, join(outputDir, entry.name));
    }
  }
  const expected = new Set(
    STATES.flatMap((state) =>
      VIEWPORTS.map((viewport) => `${state}:${viewport}`),
    ),
  );
  if (
    byKey.size !== expected.size ||
    [...expected].some((key) => !byKey.has(key))
  )
    throw new Error("candidate export is missing a state or viewport");
  if (VIEWPORTS.some((viewport) => !axeReports.has(viewport)))
    throw new Error("candidate export is missing axe evidence");
  files.sort(
    (a, b) =>
      a.state.localeCompare(b.state) || a.viewport.localeCompare(b.viewport),
  );
  const manifest = {
    implementationHead: head,
    fixture: "synthetic ARJ-28 manual-entry fixture",
    candidateCount: files.length,
    candidates: files,
    axeReports: VIEWPORTS.map((viewport) => ({
      filename: `axe-${viewport}.json`,
      sha256: digest(readFileSync(join(inputDir, `axe-${viewport}.json`))),
      viewport,
      stateCount: axeReports.get(viewport).states.length,
      violations: 0,
    })),
  };
  writeFileSync(
    join(outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  return manifest;
}

if (
  process.argv[1] &&
  basename(process.argv[1]) === basename(new URL(import.meta.url).pathname)
) {
  const [
    inputDir = "test-results/arj28-candidates",
    outputDir = "arj28-candidate-evidence",
  ] = process.argv.slice(2);
  try {
    const result = collectCandidates({ inputDir, outputDir });
    process.stdout.write(
      `Collected ${result.candidateCount} matched ARJ-28 candidates at ${result.implementationHead}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `ARJ-28 candidate collection failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  }
}
