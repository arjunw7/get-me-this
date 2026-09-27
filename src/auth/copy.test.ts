import { describe, expect, it } from "vitest";

import { emailHelpText, previewNotice } from "./copy";

/**
 * The static email-entry screen must never promise delivery or sign-in.
 * These guards hold the copy to the honest-preview boundary established in
 * ARJ-16 review.
 */

const FORBIDDEN =
  /(we('|’)?ll send|secure code|sign-in link|sending|code sent)/i;

describe("static email-entry copy", () => {
  it("says before submission that nothing is sent and nobody is signed in", () => {
    expect(emailHelpText).toBe(
      "No password. This static preview doesn’t send email or sign anyone in.",
    );
    expect(emailHelpText).not.toMatch(FORBIDDEN);
  });

  it("says after submission that the preview performed no action", () => {
    expect(previewNotice).toBe(
      "Preview only — this static preview doesn’t send email or sign you in yet.",
    );
    expect(previewNotice).not.toMatch(FORBIDDEN);
  });

  it("keeps the approved product terminology", () => {
    for (const text of [emailHelpText, previewNotice]) {
      expect(text).not.toMatch(/shelfie|circle/i);
    }
  });
});
