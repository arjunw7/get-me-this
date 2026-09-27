#!/usr/bin/env node
/**
 * Regenerates the `files` map in tests/visual/baselines/BASELINE-MANIFEST.json
 * from the PNGs currently on disk.
 *
 * This script deliberately cannot approve anything: it never touches the
 * `approvedBy`/`approvedDate` fields. After new screenshots are generated, a
 * human reviewer must inspect them and fill in the approval fields by hand
 * before the manifest and baselines may be committed. See
 * docs/delivery/visual-baselines.md.
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
      entries.push(path);
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

const manifest = exists(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { version: 1, approvedBy: null, approvedDate: null, files: {} };

manifest.files = Object.fromEntries(
  pngs.map((path) => [
    relative(baselinesDir, path),
    createHash("sha256").update(readFileSync(path)).digest("hex"),
  ]),
);

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

if (!manifest.approvedBy || !manifest.approvedDate) {
  console.log("Hashes updated. The manifest is NOT approved yet.");
  console.log(
    "A human reviewer must inspect the screenshots and fill in approvedBy/approvedDate by hand.",
  );
  process.exit(0);
}
console.log(
  `Hashes updated for ${pngs.length} baseline(s); existing approval fields preserved.`,
);

function exists(path) {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}
