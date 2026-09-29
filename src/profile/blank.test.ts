import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BLANK_CODE_POINTS, isBlank } from "./blank";

/**
 * The one blankness rule (004e): the shared predicate, the pinned blank
 * corpus with its non-blank controls, and the parity proof that the
 * migration's enumerated bracket expression classifies the identical code
 * points as the server predicate — so the two definitions cannot drift.
 */

/** The brief's blank corpus: mixtures and non-ASCII entries included. */
const BLANK_CORPUS = [
  "",
  " ",
  "\t",
  "\n",
  "\r",
  " \t\n", // mixture in one value
  "\t \t", // leading/trailing mixture (tab wrapped in spaces)
  "\u00A0",
  "\u00A0 \t", // U+00A0 mixed with ASCII whitespace
  "\u3000",
  "\uFEFF",
] as const;

/** Non-blank controls: accepted and stored verbatim, never trimmed. */
const NON_BLANK_CONTROLS = [
  "x y", // internal space
  "  x  ", // blank-looking padding around real characters
  "a\u00A0b", // internal no-break space
] as const;

describe("isBlank (the one shared whitespace rule)", () => {
  it.each(BLANK_CORPUS)("classifies %j as blank", (value) => {
    expect(isBlank(value)).toBe(true);
  });

  it.each(NON_BLANK_CONTROLS)("classifies %j as non-blank", (value) => {
    expect(isBlank(value)).toBe(false);
  });

  it("treats real content mixed with blanks as non-blank", () => {
    expect(isBlank("\u00A0real\u3000")).toBe(false);
  });

  it("pins the set at exactly 26 code points", () => {
    expect(new Set(BLANK_CODE_POINTS).size).toBe(26);
  });
});

describe("migration parity: the database rule and the server rule agree", () => {
  /** The canonical bracket expression the migration must contain. */
  const MIGRATION_FILE =
    "supabase/migrations/20260929000000_profiles_taste_line.sql";

  type CodePointRange = { from: number; to: number };

  function readMigration(): string {
    return readFileSync(
      path.join(__dirname, "..", "..", MIGRATION_FILE),
      "utf8",
    );
  }

  /**
   * Extracts every occurrence of the migration's bracket expression and
   * parses its `\uwxyz` escapes and `\uwxyz-\uwxyz` ranges.
   */
  function parseMigrationBlankSet(): {
    occurrences: number;
    singles: number[];
    ranges: CodePointRange[];
    perOccurrence: number[];
  } {
    const source = readMigration();
    const pattern = /\^\[([^\]]+)\]\*\$/g;
    const singles: number[] = [];
    const ranges: CodePointRange[] = [];
    const perOccurrence: number[] = [];
    let occurrences = 0;
    for (const match of source.matchAll(pattern)) {
      occurrences += 1;
      let codePoints = 0;
      const token = /\\u([0-9A-Fa-f]{4})(?:-\\u([0-9A-Fa-f]{4}))?/g;
      for (const element of match[1]!.matchAll(token)) {
        const from = parseInt(element[1]!, 16);
        if (element[2]) {
          const to = parseInt(element[2], 16);
          codePoints += to - from + 1;
          ranges.push({ from, to });
        } else {
          codePoints += 1;
          singles.push(from);
        }
      }
      perOccurrence.push(codePoints);
    }
    return { occurrences, singles, ranges, perOccurrence };
  }

  const parsed = parseMigrationBlankSet();

  function migrationSetHas(codePoint: number): boolean {
    if (parsed.singles.includes(codePoint)) return true;
    return parsed.ranges.some(
      (range) => codePoint >= range.from && codePoint <= range.to,
    );
  }

  it("the migration enumerates the blank set with ARE escapes in every occurrence", () => {
    // Normalization updates (2), the trigger, and the two CHECK
    // constraints each carry the identical canonical expression: every
    // occurrence enumerates exactly the pinned 26 code points.
    expect(parsed.occurrences).toBeGreaterThanOrEqual(5);
    // Every occurrence enumerates the identical 26 code points.
    expect(parsed.perOccurrence.every((tokens) => tokens === 26)).toBe(true);
    const enumerated = new Set<number>([
      ...parsed.singles,
      ...parsed.ranges.flatMap((range) =>
        range.from === range.to
          ? [range.from]
          : [
              range.from,
              range.to,
              ...Array.from(
                { length: range.to - range.from + 1 },
                (_, index) => range.from + index,
              ),
            ],
      ),
    ]);
    expect(enumerated.size).toBe(26);
    expect([...enumerated].sort((a, b) => a - b)).toEqual(
      BLANK_CODE_POINTS.map((point) => point.codePointAt(0)!).sort(
        (a, b) => a - b,
      ),
    );
    // Never `\s`, `[[:space:]]`, or btrim — the brief's prohibitions
    // (checked against executable statements, not the explanatory
    // comments that name them).
    const statements = readMigration()
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(statements).not.toContain("[[:space:]]");
    expect(statements).not.toMatch(/btrim\s*\(/);
    expect(statements).not.toMatch(/\\s|\[:space:\]/);
  });

  // The classification parity proof: every Unicode code point (surrogates
  // excluded — no string form) classifies identically under the server
  // predicate and the migration's enumerated set.
  it("classifies every code point identically", () => {
    for (let codePoint = 0; codePoint <= 0x10ffff; codePoint += 1) {
      if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
      const character = String.fromCodePoint(codePoint);
      expect(isBlank(character), `U+${codePoint.toString(16)}`).toBe(
        migrationSetHas(codePoint),
      );
    }
  });
});
