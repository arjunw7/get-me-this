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

const ARJ28_STATES = [
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
// The 005f extraction-flow candidates captured by
// tests/visual/wishlist-extract.visual.spec.ts (held-interception states
// included). All of them must land in the uploaded artifact alongside the
// ARJ-28 responsive states.
const ARJ31_STATES = [
  "add-initial",
  "add-initial-prefilled",
  "add-loading",
  "add-extracted-review",
  "add-validation",
  "add-partial-review",
  "add-manual-fallback",
  "wishlist-added-notice",
];
const SOURCES = [
  {
    prefix: "arj28",
    states: ARJ28_STATES,
    fixture: "synthetic ARJ-28 manual-entry fixture",
  },
  {
    prefix: "arj31",
    states: ARJ31_STATES,
    fixture: "synthetic ARJ-31 extraction-review fixture",
  },
];
const VIEWPORTS = ["mobile", "desktop"];
// Derived from SOURCES so the accepted filenames cannot drift from the
// validated state lists.
const IMAGE_NAME = new RegExp(
  `^(${SOURCES.map(({ prefix }) => prefix).join("|")})-([a-z0-9-]+)-(mobile|desktop)\\.png$`,
);
const AXE_NAME = /^axe-(mobile|desktop)\.json$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// The manifest pins the exact pushed head. For pull_request runs neither
// GITHUB_SHA nor the checkout's HEAD is that head (both are the
// server-side merge commit), so CI passes the event's PR head SHA through
// CANDIDATE_IMPLEMENTATION_HEAD; local runs fall back to the checkout's
// HEAD. The value is never hardcoded.
function resolveHead(repositoryRoot) {
  const override = process.env.CANDIDATE_IMPLEMENTATION_HEAD ?? "";
  if (override) {
    if (!/^[0-9a-f]{40}$/i.test(override))
      throw new Error("implementation head override is not a full commit SHA");
    return override;
  }
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  if (!/^[0-9a-f]{40}$/i.test(head))
    throw new Error("unable to resolve implementation head");
  return head;
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
  arj28Dir,
  arj31Dir,
  outputDir,
  repositoryRoot = process.cwd(),
}) {
  const inputDirs = new Map([
    ["arj28", arj28Dir],
    ["arj31", arj31Dir],
  ]);
  for (const [prefix, inputDir] of inputDirs) {
    const rootInfo = lstatSync(inputDir);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
      throw new Error(`${prefix} candidate source must be a regular directory`);
  }
  const head = resolveHead(repositoryRoot);
  mkdirSync(outputDir, { recursive: false });
  const outputEntries = readdirSync(outputDir);
  if (outputEntries.length)
    throw new Error("candidate export destination must be empty");
  const byKey = new Map();
  const files = [];
  // Per-source axe reports keyed by prefix then viewport, because each
  // source directory carries its own axe-<viewport>.json.
  const axeReports = new Map();
  for (const [prefix, inputDir] of inputDirs) {
    const source = SOURCES.find(({ prefix: p }) => p === prefix);
    const sourceAxe = new Map();
    axeReports.set(prefix, sourceAxe);
    const entries = readdirSync(inputDir, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = join(inputDir, entry.name);
      const info = lstatSync(sourcePath);
      if (info.isSymbolicLink())
        throw new Error("candidate directories cannot contain symlinks");
      if (!info.isFile()) continue;
      const image = entry.name.match(IMAGE_NAME);
      if (image && image[1] === prefix) {
        const state = image[2];
        const viewport = image[3];
        if (!source.states.includes(state)) continue;
        const key = `${prefix}:${state}:${viewport}`;
        if (byKey.has(key))
          throw new Error("duplicate candidate state and viewport");
        const bytes = readFileSync(sourcePath);
        if (
          bytes.length < PNG_SIGNATURE.length ||
          !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
        )
          throw new Error("candidate is not a PNG");
        copyFileSync(sourcePath, join(outputDir, entry.name));
        byKey.set(
          key,
          manifestEntry(
            entry.name,
            bytes,
            head,
            state,
            viewport,
            source.fixture,
          ),
        );
        continue;
      }
      const axe = entry.name.match(AXE_NAME);
      if (axe) {
        const viewport = axe[1];
        if (sourceAxe.has(viewport)) throw new Error("duplicate axe report");
        const report = JSON.parse(readFileSync(sourcePath, "utf8"));
        if (
          report.viewport !== viewport ||
          !Array.isArray(report.states) ||
          report.states.length !== source.states.length
        )
          throw new Error("invalid axe report");
        if (
          report.states.some(
            (state) =>
              !source.states.includes(state.state) ||
              !Array.isArray(state.violationIds) ||
              state.violationIds.length,
          )
        )
          throw new Error("axe report contains violations or unknown states");
        sourceAxe.set(viewport, report);
        copyFileSync(
          sourcePath,
          join(outputDir, `axe-${prefix}-${viewport}.json`),
        );
      }
    }
  }
  const expected = new Set(
    SOURCES.flatMap(({ prefix, states }) =>
      states.flatMap((state) =>
        VIEWPORTS.map((viewport) => `${prefix}:${state}:${viewport}`),
      ),
    ),
  );
  if (
    byKey.size !== expected.size ||
    [...expected].some((key) => !byKey.has(key))
  )
    throw new Error("candidate export is missing a state or viewport");
  for (const { prefix } of SOURCES) {
    const sourceAxe = axeReports.get(prefix);
    if (VIEWPORTS.some((viewport) => !sourceAxe.has(viewport)))
      throw new Error("candidate export is missing axe evidence");
  }
  files.push(...byKey.values());
  files.sort(
    (a, b) =>
      a.filename.localeCompare(b.filename) ||
      a.viewport.localeCompare(b.viewport),
  );
  const manifest = {
    implementationHead: head,
    sources: SOURCES.map(({ prefix, states, fixture }) => ({
      prefix,
      fixture,
      stateCount: states.length,
    })),
    candidateCount: files.length,
    candidates: files,
    axeReports: VIEWPORTS.flatMap((viewport) =>
      SOURCES.map(({ prefix, states }) => ({
        filename: `axe-${prefix}-${viewport}.json`,
        sha256: digest(
          readFileSync(join(inputDirs.get(prefix), `axe-${viewport}.json`)),
        ),
        viewport,
        stateCount: states.length,
        violations: 0,
      })),
    ),
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
    arj28Dir = "test-results/arj28-candidates",
    arj31Dir = "test-results/arj31-candidates",
    outputDir = "arj28-candidate-evidence",
  ] = process.argv.slice(2);
  try {
    const result = collectCandidates({ arj28Dir, arj31Dir, outputDir });
    process.stdout.write(
      `Collected ${result.candidateCount} matched ARJ-28/ARJ-31 candidates at ${result.implementationHead}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `ARJ-28 candidate collection failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  }
}
