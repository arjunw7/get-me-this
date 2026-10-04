import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const tokensPath = join(repositoryRoot, "app", "tokens.css");
const tokensSource = readFileSync(tokensPath, "utf8");

const REQUIRED_TOKENS = [
  "--color-surface-page",
  "--color-surface-raised",
  "--color-surface-sunken",
  "--color-outline-strong",
  "--color-outline-subtle",
  "--color-content-primary",
  "--color-content-secondary",
  "--color-content-muted",
  "--color-action-primary",
  "--color-action-primary-strong",
  "--color-action-primary-soft",
  "--color-accent-highlight",
  "--color-accent-highlight-strong",
  "--color-accent-highlight-soft",
  "--color-accent-info",
  "--color-accent-info-strong",
  "--color-accent-info-soft",
  "--color-accent-fresh",
  "--color-accent-fresh-strong",
  "--color-accent-fresh-soft",
  "--color-feedback-error",
  "--color-feedback-error-soft",
  "--color-focus-ring",
  "--font-display",
  "--font-body",
  "--text-display-lg",
  "--text-display-md",
  "--text-display-sm",
  "--text-heading",
  "--text-body",
  "--text-label",
  "--text-caption",
  "--spacing-gutter",
  "--spacing-gutter-lg",
  "--spacing-touch-min",
  "--spacing-control-md",
  "--spacing-control-lg",
  "--radius-control",
  "--radius-surface",
  "--radius-surface-lg",
  "--radius-pill",
  "--border-strong",
  "--shadow-chunk-sm",
  "--shadow-chunk",
  "--shadow-chunk-lg",
  "--ease-snap",
  "--duration-press",
  "--duration-reveal",
] as const;

function declarationCount(token: string) {
  const pattern = new RegExp(`^\\s*${token}:`, "gm");
  return tokensSource.match(pattern)?.length ?? 0;
}

function collectFiles(
  directory: string,
  extensions: readonly string[],
): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(entryPath, extensions);
    }
    return extensions.some((extension) => entry.name.endsWith(extension))
      ? [entryPath]
      : [];
  });
}

describe("design tokens", () => {
  it("declares every required semantic token exactly once", () => {
    const missing = REQUIRED_TOKENS.filter(
      (token) => declarationCount(token) !== 1,
    );
    expect(missing).toEqual([]);
  });

  it("registers tokens inside a Tailwind theme block", () => {
    expect(tokensSource).toContain("@theme {");
  });

  it("uses semantic names rather than prototype colour names", () => {
    const prototypeNames = [
      "--color-paper",
      "--color-cream",
      "--color-ink",
      "--color-coral",
      "--color-marigold",
      "--color-electric",
      "--color-lime",
    ];
    for (const name of prototypeNames) {
      expect(tokensSource).not.toContain(`${name}:`);
    }
  });

  it("keeps raw colour values out of every other production source file", () => {
    const sourceFiles = [
      ...collectFiles(join(repositoryRoot, "app"), [".tsx", ".ts", ".css"]),
      ...collectFiles(join(repositoryRoot, "src"), [".tsx", ".ts"]),
    ].filter(
      // Scoped 009a amendment: src/email/brand-palette.ts is the single
      // documented home of the email-rendering palette — external email
      // clients cannot consume Tailwind CSS variables (see that module).
      (filePath) =>
        filePath !== tokensPath &&
        filePath !== join(repositoryRoot, "src", "email", "brand-palette.ts"),
    );

    const offenders = sourceFiles.filter((filePath) =>
      /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(filePath, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
