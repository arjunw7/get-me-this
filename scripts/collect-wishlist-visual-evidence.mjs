import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

const source = resolve(process.argv[2] ?? "test-results");
const target = resolve(process.argv[3] ?? "wishlist-visual-evidence");
const allowedName =
  /^wishlist-(empty|filled)-(mobile|desktop)-(actual|diff)\.png$/;
// Playwright 1.63.0 forms each output directory from the spec path and test
// title, trims it to 60 characters with a five-character hash, then appends
// the project id. These four values match the pinned visual specs and the
// configured CI run; an unknown suite, title, state, or viewport fails closed.
const allowedRunDirectory = {
  empty: "visual-wishlist-empty.visu-c62a8-inned-V18-empty-composition",
  filled: "visual-wishlist-filled.vis-24b41-nned-V18-filled-composition",
};

mkdirSync(target, { recursive: true });
const copied = new Set();

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(path);
      continue;
    }
    if (!entry.isFile()) continue;
    const match = allowedName.exec(basename(path));
    if (!match) continue;
    const components = relative(source, directory).split(sep);
    if (
      components.length !== 1 ||
      components[0] !== `${allowedRunDirectory[match[1]]}-${match[2]}`
    )
      continue;
    if (copied.has(entry.name))
      throw new Error("duplicate wishlist image evidence filename");
    copyFileSync(path, join(target, entry.name));
    copied.add(entry.name);
  }
}

if (existsSync(source)) visit(source);
process.stdout.write(
  `wishlist image evidence: ${copied.size} allowlisted PNGs\n`,
);
