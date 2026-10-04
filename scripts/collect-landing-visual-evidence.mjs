import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

const source = resolve(process.argv[2] ?? "test-results");
const target = resolve(process.argv[3] ?? "landing-visual-evidence");
const allowedName = /^landing-(mobile|desktop)-(actual|diff)\.png$/;
// Pin the public landing spec's output directory. Never upload auth traces,
// reports, error contexts, screenshots from another suite, or symlinks.
const allowedRunDirectory =
  "visual-landing.visual-landing-page-is-visually-stable";

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
      components[0] !== `${allowedRunDirectory}-${match[1]}`
    )
      continue;
    if (copied.has(entry.name))
      throw new Error("duplicate landing image evidence filename");
    copyFileSync(path, join(target, entry.name));
    copied.add(entry.name);
  }
}

if (existsSync(source)) visit(source);
process.stdout.write(
  `landing image evidence: ${copied.size} allowlisted PNGs\n`,
);
