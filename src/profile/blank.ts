/**
 * The one blankness rule (004e, owner correction 2026-09-29).
 *
 * A value is BLANK when it is null, the empty string, or consists solely of
 * characters from the pinned 26-code-point blank set: the Unicode
 * `White_Space` property plus U+FEFF. The set is enumerated — never `\s` —
 * because PostgreSQL's `\s` (ASCII-only, locale-dependent) and JavaScript's
 * `\s` disagree; the database migration enumerates the identical set in a
 * bracket expression, and a test (blank.test.ts) proves the two
 * classifications agree code point for code point.
 *
 * This module is the SINGLE shared predicate: onboarding validation, the
 * profile-completeness gate, and the tests all call `isBlank` — no caller
 * reimplements it.
 *
 * Non-blank values are stored exactly as provided: nothing trims, rewrites,
 * or otherwise normalizes them. Only wholly blank values are affected.
 */

/** The pinned blank set: Unicode White_Space plus U+FEFF (26 code points). */
export const BLANK_CODE_POINTS: readonly string[] = [
  "\u0009", // tab
  "\u000A", // line feed
  "\u000B", // line tabulation
  "\u000C", // form feed
  "\u000D", // carriage return
  "\u0020", // space
  "\u0085", // next line
  "\u00A0", // no-break space
  "\u1680", // ogham space mark
  "\u2000", // en quad
  "\u2001", // em quad
  "\u2002", // en space
  "\u2003", // em space
  "\u2004", // three-per-em space
  "\u2005", // four-per-em space
  "\u2006", // six-per-em space
  "\u2007", // figure space
  "\u2008", // punctuation space
  "\u2009", // thin space
  "\u200A", // hair space
  "\u2028", // line separator
  "\u2029", // paragraph separator
  "\u202F", // narrow no-break space
  "\u205F", // medium mathematical space
  "\u3000", // ideographic space
  "\uFEFF", // zero-width no-break space
];

// Built from the enumerated set (with `u` semantics already guaranteed by
// explicit escapes, which are also the safest form across JS engines):
// deliberately NOT bare `\s`, which omits U+0085/U+FEFF-adjacent points and
// disagrees with the database engine's `\s`.
const BLANK_PATTERN = new RegExp(
  `^[${BLANK_CODE_POINTS.map(
    (point) => `\\u${point.codePointAt(0)!.toString(16).padStart(4, "0")}`,
  ).join("")}]*$`,
  "u",
);

/**
 * True when the value is blank under the one pinned rule: the empty string,
 * or consists solely of characters from the pinned blank set. Null is
 * handled by callers (the rule also defines null as blank); non-string
 * values are never passed by validated callers.
 */
export function isBlank(value: string): boolean {
  return value.length === 0 || BLANK_PATTERN.test(value);
}
