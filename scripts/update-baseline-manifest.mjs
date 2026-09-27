#!/usr/bin/env node
/**
 * Regenerates the `files` map in tests/visual/baselines/BASELINE-MANIFEST.json
 * from the PNGs currently on disk.
 *
 * This script deliberately cannot approve anything. Whenever the hashes
 * change (new screenshots, updated screenshots, added or removed entries),
 * any previous approval is cleared: a stale approval must never authorize
 * new screenshots. A human reviewer must then inspect the images and fill in
 * approvedBy/approvedDate by hand before the manifest and baselines may be
 * committed. See docs/delivery/visual-baselines.md.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const baselinesDir = fileURLToPath(
  new URL("../tests/visual/baselines/", import.meta.url),
);
const manifestPath = join(baselinesDir, "BASELINE-MANIFEST.json");

function pngsUnder(directory) {
  const entries = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      entries.push(...pngsUnder(path));
    } else if (entry.name.endsWith(".png")) {
      // Transient Playwright artifacts (-actual/-diff/-previous) are never
      // part of the recorded baseline set.
      if (!/-(actual|diff|previous)\.png$/.test(entry.name)) {
        entries.push(path);
      }
    }
  }
  return entries;
}

const pngs = pngsUnder(baselinesDir);
if (pngs.length === 0) {
  console.error(`No baselines found under ${baselinesDir}.`);
  console.error(
    "Generate them first with: pnpm exec playwright test tests/visual --update-snapshots",
  );
  process.exit(1);
}

const previousManifest = exists(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { version: 1, approvedBy: null, approvedDate: null, files: {} };

const newFiles = Object.fromEntries(
  pngs.map((path) => [
    relative(baselinesDir, path),
    createHash("sha256").update(readFileSync(path)).digest("hex"),
  ]),
);

const hashesChanged = !sameEntries(previousManifest.files, newFiles);

const manifest = {
  version: 1,
  approvedBy: hashesChanged ? null : (previousManifest.approvedBy ?? null),
  approvedDate: hashesChanged ? null : (previousManifest.approvedDate ?? null),
  files: newFiles,
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

if (hashesChanged) {
  console.log("Baseline hashes changed. Any previous approval is cleared.");
  console.log(
    "The manifest is NOT approved: a human reviewer must inspect the screenshots and fill in approvedBy/approvedDate by hand.",
  );
} else {
  console.log(
    `Hashes unchanged for ${pngs.length} baseline(s); existing approval fields preserved.`,
  );
}

function sameEntries(a = {}, b = {}) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => a[key] === b[key]);
}

function exists(path) {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}
