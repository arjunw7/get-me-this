import { describe, expect, it } from "vitest";

import { previewNotice } from "./copy";

/**
 * The static URL-fixture screens (003b) keep their honest self-labeling:
 * the verify screen's `?state=` frames send nothing and sign nobody in,
 * and the notice below says exactly that. (The real flow's copy lives in
 * flow-copy.ts and is pinned by flow-copy.test.ts.)
 */

const FORBIDDEN =
  /(we('|’)?ll send|secure code|sign-in link|sending|code sent)/i;

describe("static fixture copy", () => {
  it("labels every fixture frame that could imply a backend action", () => {
    expect(previewNotice).toBe(
      "Preview only — this static preview doesn’t send email or sign you in yet.",
    );
  });

  it("is honest about the fixture boundary and keeps the approved terminology", () => {
    // The fixture frame itself sends nothing, so the static-copy phrasing
    // stays truthful of it.
    expect(previewNotice).not.toMatch(FORBIDDEN);
    expect(previewNotice).not.toMatch(/shelfie|circle/i);
  });
});
