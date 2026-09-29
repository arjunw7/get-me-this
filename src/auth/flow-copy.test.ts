import { describe, expect, it } from "vitest";

import {
  confirmBackToCodeLabel,
  confirmChangeEmailLabel,
  confirmInterimHeading,
  confirmInterimText,
  invalidEmailCopy,
  overLimitCopy,
  requestCodeHelpText,
  requestCodePendingText,
  rejectedCodeCopy,
  resendButtonLabel,
  resendCountdownLabel,
  shortCodeCopy,
  signOutLabel,
  signedInHeading,
  signedInText,
  unavailableCopy,
  verifyHeading,
  verifyIntroText,
  verifySubmitLabel,
  verifyUnavailableCopy,
} from "./flow-copy";

/**
 * Copy honesty for the real email-code flow (004c): the screens promise
 * the working code flow only. They never invite use of the emailed
 * sign-in link (004d), never claim a delivery or a sign-in that did not
 * happen, and never pass through account-specific provider messages —
 * failures come from the closed generic set.
 */

/** Copy that would promise or invite the not-yet-implemented link flow. */
const LINK_INVITATION =
  /sign-in link|tap .* in the email|either works|or tap|the link works/i;
/** Copy that would promise a send the flow does not perform (static copy). */
const STATIC_PREVIEW = /static preview|preview only/i;

const ALL_COPY = [
  requestCodeHelpText,
  requestCodePendingText,
  invalidEmailCopy,
  overLimitCopy,
  unavailableCopy,
  verifyHeading,
  verifyIntroText("you@example.com"),
  shortCodeCopy,
  rejectedCodeCopy,
  verifyUnavailableCopy,
  signedInHeading,
  signedInText("you@example.com"),
  signOutLabel,
  verifySubmitLabel,
  resendButtonLabel,
  resendCountdownLabel(60),
  resendCountdownLabel(30),
  confirmInterimHeading,
  confirmInterimText,
  confirmBackToCodeLabel,
  confirmChangeEmailLabel,
];

describe("real-flow copy honesty", () => {
  it("promises the working code flow on the entry screen", () => {
    expect(requestCodeHelpText).toBe(
      "No password. We’ll send you a secure code to sign in.",
    );
  });

  it("never invites the emailed sign-in link anywhere in the flow", () => {
    // The interim confirm copy is the one place the link may be MENTIONED —
    // to say it is not active — and it is asserted separately below.
    for (const text of ALL_COPY.filter((t) => t !== confirmInterimText)) {
      expect(text, text).not.toMatch(LINK_INVITATION);
    }
  });

  it("never reads as the static preview on the real screens", () => {
    for (const text of ALL_COPY) {
      expect(text, text).not.toMatch(STATIC_PREVIEW);
    }
  });

  it("keeps the approved terminology", () => {
    for (const text of ALL_COPY) {
      expect(text).not.toMatch(/shelfie|circle/i);
    }
  });

  it("maps failures to the closed generic set without claiming a cause", () => {
    // One provider failure covers wrong, expired, reused, and superseded
    // codes; the copy must not claim which one happened.
    expect(rejectedCodeCopy).toMatch(/didn’t work/i);
    expect(rejectedCodeCopy).toMatch(/may have expired/i);
    expect(rejectedCodeCopy).not.toMatch(/wrong code|was reused|was used/i);
    // The over-limit and unavailable states are honest about what to do.
    expect(overLimitCopy).toMatch(/wait a moment/i);
    expect(unavailableCopy).toMatch(/try again/i);
    expect(verifyUnavailableCopy).toMatch(/try again/i);
  });

  it("states the interim confirm boundary without claiming a sign-in", () => {
    expect(confirmInterimHeading).toBe("One more step.");
    expect(confirmInterimText).toMatch(/isn’t active yet/i);
    expect(confirmInterimText).toMatch(/did nothing/i);
    expect(confirmInterimText).toMatch(/six-digit code works/i);
  });

  it("formats the countdown as m:ss with zero padding", () => {
    expect(resendCountdownLabel(60)).toBe("Resend code in 1:00");
    expect(resendCountdownLabel(30)).toBe("Resend code in 0:30");
    expect(resendCountdownLabel(0)).toBe("Resend code in 0:00");
  });
});
