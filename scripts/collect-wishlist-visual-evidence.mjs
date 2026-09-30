import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

const source = resolve(process.argv[2] ?? "test-results");
const target = resolve(process.argv[3] ?? "wishlist-visual-evidence");
const allowedName =
  /^wishlist-(empty|filled)-(mobile|desktop)-(actual|diff)\.png$/;

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
      !components.some((part) => part.startsWith(`wishlist-${match[1]}.visual`))
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
