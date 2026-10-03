"use client";

import { useId, useState, useActionState, type FormEvent } from "react";

import { buttonClassName, cx } from "@/src/ui/styles";
import { ArrowRightIcon } from "@/src/landing/icons";
import {
  authCardClassName,
  authInputClassName,
  AuthLayout,
} from "./auth-layout";
import { PreviewNotice } from "./preview-notice";
import {
  parseOnboardingVariant,
  TASTE_LINE_MAX,
  TASTE_LINE_SUGGESTIONS,
  type OnboardingVariant,
} from "./fixtures";
import {
  validateOnboardingInput,
  DISPLAY_NAME_MAX,
} from "@/src/profile/onboarding";
import type { OnboardingSubmitState } from "@/src/profile/onboarding-state";
import { completeOnboardingAction } from "@/src/profile/onboarding-actions";

/**
 * First-time onboarding, ported from the frozen V18 reference
 * (pages/auth/Onboarding.tsx): display name (required) and the optional
 * one-line taste field with suggestion chips. No avatar-selection control
 * is invented — the frozen reference has none.
 *
 * Two modes:
 * - FIXTURE (`variant` prop, `?state=` URLs): the static designed states
 *   for review and visual capture. A valid submission reveals the preview
 *   notice instead of saving; nothing navigates.
 * - LIVE (`live` prop, the bare /onboarding route, 004e): submits to the
 *   `completeOnboardingAction` server action, which re-validates every
 *   rule server-side and persists through the owner-only RLS grant, then
 *   navigates to `/home`. The rendered states (empty form, validation
 *   errors) are identical to the fixture states — the committed onboarding
 *   baselines stay valid.
 *
 * The reference prefilled the name from the prototype's fake session email;
 * the form starts empty with the reference's placeholder (documented
 * difference).
 */

const NAME_ERROR = "Friends need something to call you.";
const NAME_TOO_LONG_COPY = `That’s a bit long — ${DISPLAY_NAME_MAX} characters at most.`;
const LINE_TOO_LONG_COPY = `Keep it to ${TASTE_LINE_MAX} characters.`;
const SAVE_FAILED_COPY =
  "We couldn’t save that just now. Try again in a moment.";

export function OnboardingForm({
  variant,
  live = false,
  completeAction,
  flowId,
}: {
  variant?: OnboardingVariant;
  /** Live mode: the real server-action submission (004e). */
  live?: boolean;
  /**
   * Optional alternate completion action (brief 006c): the invitation
   * onboarding passes its flow-specific action, which re-checks the
   * session and flow on every submit and returns to the clean invitation
   * preview instead of /home. Defaults to the 004e action.
   */
  completeAction?: typeof completeOnboardingAction;
  /** The invitation flow id, carried as hidden input for the invite action. */
  flowId?: string;
}) {
  const parsed = parseOnboardingVariant(variant);
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [touched, setTouched] = useState(parsed === "validation");
  const [preview, setPreview] = useState(false);
  const [submitState, submitFormAction] = useActionState(
    completeAction ?? completeOnboardingAction,
    { status: "idle" } as OnboardingSubmitState,
  );
  const nameErrorId = useId();
  const noticeId = useId();
  const lineHelpId = useId();
  const saveErrorId = useId();

  // One validation function for the client convenience check and the
  // server action alike (the action re-runs it — the client check is not
  // proof). Blankness follows the one shared whitespace rule.
  const clientValidation = validateOnboardingInput(name, line);
  const nameError =
    touched &&
    (!clientValidation.ok ? clientValidation.errors.displayName : undefined);

  function submit(event: FormEvent<HTMLFormElement>) {
    setTouched(true);
    if (!clientValidation.ok) {
      event.preventDefault();
      setPreview(false);
      return;
    }
    if (!live) {
      // Fixture mode only: no profile is saved, nobody navigates.
      event.preventDefault();
      setPreview(true);
    }
  }

  const serverErrors =
    submitState.status === "error" && "errors" in submitState
      ? submitState.errors
      : undefined;
  const saveFailed =
    submitState.status === "error" && "failure" in submitState
      ? submitState.failure
      : undefined;

  return (
    <AuthLayout back={{ href: "/", label: "Home" }}>
      <div className={authCardClassName}>
        <p className="text-center text-sm font-bold text-feedback-error">
          One last thing
        </p>
        <h1 className="mt-2 text-center font-display text-4xl leading-[1] font-extrabold tracking-tight sm:text-display-xl">
          Tell friends who you are.
        </h1>
        <p className="mt-3 text-center text-lg text-content-secondary">
          This is how you’ll show up in groups and on your wishlist.
        </p>

        <form
          action={live ? submitFormAction : undefined}
          onSubmit={submit}
          noValidate
          className="mt-7 flex flex-col gap-6"
        >
          {flowId ? <input type="hidden" name="flowId" value={flowId} /> : null}
          <div className="block">
            <label htmlFor="display-name" className="block text-sm font-bold">
              What should friends call you?
            </label>
            <input
              id="display-name"
              name="displayName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Arjun"
              autoComplete="name"
              maxLength={DISPLAY_NAME_MAX}
              aria-invalid={
                nameError || serverErrors?.displayName ? true : undefined
              }
              aria-describedby={
                nameError || serverErrors?.displayName ? nameErrorId : undefined
              }
              className={cx(
                authInputClassName({
                  invalid: Boolean(nameError || serverErrors?.displayName),
                }),
                "pl-4",
              )}
            />
            {nameError || serverErrors?.displayName ? (
              <span
                id={nameErrorId}
                role="alert"
                className="mt-1.5 block text-sm font-semibold text-feedback-error"
              >
                {nameError === "too-long" ||
                serverErrors?.displayName === "too-long"
                  ? NAME_TOO_LONG_COPY
                  : NAME_ERROR}
              </span>
            ) : null}
          </div>

          <div className="block">
            <label htmlFor="personality-line" className="text-sm font-bold">
              Describe your taste in one line{" "}
              <span className="font-semibold text-content-muted">
                (optional)
              </span>
            </label>
            <input
              id="personality-line"
              name="tasteLine"
              value={line}
              onChange={(event) =>
                setLine(event.target.value.slice(0, TASTE_LINE_MAX))
              }
              placeholder="e.g. currently in my tiny-luxuries era"
              maxLength={TASTE_LINE_MAX}
              aria-invalid={serverErrors?.tasteLine ? true : undefined}
              aria-describedby={lineHelpId}
              className={cx(authInputClassName({ invalid: false }), "pl-4")}
            />
            {serverErrors?.tasteLine ? (
              <span
                role="alert"
                className="mt-1.5 block text-sm font-semibold text-feedback-error"
              >
                {LINE_TOO_LONG_COPY}
              </span>
            ) : null}
            <div
              id={lineHelpId}
              className="mt-1.5 flex items-center justify-between text-caption text-content-muted"
            >
              <span>Shows under your name. Helps friends pick.</span>
              <span className="tabular-nums">
                {line.length}/{TASTE_LINE_MAX}
              </span>
            </div>
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="group"
              aria-label="Suggestions"
            >
              {TASTE_LINE_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setLine(suggestion)}
                  aria-pressed={line === suggestion}
                  className={cx(
                    "inline-flex min-h-9 items-center rounded-pill border-2 px-3 text-sm font-semibold",
                    "transition-colors duration-[var(--duration-press)] ease-snap",
                    line === suggestion
                      ? "border-outline-strong bg-outline-strong text-surface-page"
                      : "border-outline-strong/20 bg-surface-raised hover:border-outline-strong",
                  )}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {saveFailed ? (
            <p
              id={saveErrorId}
              role="alert"
              className="text-sm font-semibold text-feedback-error"
            >
              {SAVE_FAILED_COPY}
            </p>
          ) : null}

          {preview ? <PreviewNotice id={noticeId} /> : null}

          <button
            type="submit"
            className={cx(
              buttonClassName({ variant: "primary", size: "lg" }),
              "w-full",
            )}
          >
            Let’s go <ArrowRightIcon className="h-5 w-5" />
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
