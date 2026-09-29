import { describe, expect, it } from "vitest";

import {
  confirmBackToCodeLabel,
  confirmChangeEmailLabel,
  confirmInterimHeading,
  confirmInterimText,
  invalidEmailCopy,
  linkBackToCodeLabel,
  linkChoiceHeading,
  linkChoiceText,
  linkRecoveryHeading,
  linkRecoveryText,
  linkRejectedCopy,
  linkVerifyButtonLabel,
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
 * Copy honesty for the real email-code flow (004c) and its magic-link
 * completion (004d). Screens promise only what works: the code path never
 * invites the link outside the 004d link screens, the link screens promise
 * only the explicit verification action (no automatic sign-in, no claim of
 * arrival at a wishlist or group), and nothing passes through an
 * account-specific provider message — failures come from the closed
 * generic set.
 */

/** Copy that would invite the link flow OUTSIDE the 004d link screens. */
const LINK_INVITATION =
  /sign-in link|tap .* in the email|either works|or tap|the link works/i;
/** Copy that would promise a send the flow does not perform (static copy). */
const STATIC_PREVIEW = /static preview|preview only/i;

const ALL_CODE_PATH_COPY = [
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

/** The 004d link screens, where the sign-in link may be invited. */
const ALL_LINK_COPY = [
  linkChoiceHeading,
  linkChoiceText,
  linkVerifyButtonLabel,
  linkBackToCodeLabel,
  linkRejectedCopy,
  linkRecoveryHeading,
  linkRecoveryText,
];

describe("real-flow copy honesty", () => {
  it("promises the working code flow on the entry screen", () => {
    expect(requestCodeHelpText).toBe(
      "No password. We’ll send you a secure code to sign in.",
    );
  });

  it("never invites the emailed sign-in link on the code-path screens", () => {
    // The 004d link screens are the one place the link may be invited —
    // asserted separately below.
    for (const text of ALL_CODE_PATH_COPY.filter(
      (t) => t !== confirmInterimText,
    )) {
      expect(text, text).not.toMatch(LINK_INVITATION);
    }
  });

  it("keeps the interim confirm mention of the link honest", () => {
    expect(confirmInterimText).toMatch(/isn’t active yet/i);
  });

  it("promises only the explicit verification action on the link screens", () => {
    expect(linkVerifyButtonLabel).toBe("Use my sign-in link");
    expect(linkChoiceText).toMatch(/tap below to finish signing in/i);
    // Never an automatic sign-in claim.
    for (const text of ALL_LINK_COPY) {
      expect(text, text).not.toMatch(/signing you in|you’re signed in as/i);
    }
    // Never a claim of arrival or creation at an unbuilt destination.
    for (const text of ALL_LINK_COPY) {
      expect(text, text).not.toMatch(/wishlist|group/i);
    }
  });

  it("maps link failures to the closed generic set without claiming a cause", () => {
    expect(linkRejectedCopy).toMatch(/didn’t work/i);
    expect(linkRejectedCopy).toMatch(/expired or already been used/i);
    expect(linkRecoveryHeading).toBe("This link didn’t work.");
    expect(linkRecoveryText).toMatch(/expired or already been used/i);
    expect(linkRecoveryText).toMatch(/six-digit code works/i);
    // The recovery always names the way back.
    expect(linkBackToCodeLabel).toMatch(/six-digit code/i);
  });

  it("never reads as the static preview on the real screens", () => {
    for (const text of [...ALL_CODE_PATH_COPY, ...ALL_LINK_COPY]) {
      expect(text, text).not.toMatch(STATIC_PREVIEW);
    }
  });

  it("keeps the approved terminology", () => {
    for (const text of [...ALL_CODE_PATH_COPY, ...ALL_LINK_COPY]) {
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
