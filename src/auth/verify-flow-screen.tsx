"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useActionState,
  useId,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import { buttonClassName, cx } from "@/src/ui/styles";
import { AlertCircleIcon, CheckIcon, ClockIcon } from "@/src/landing/icons";
import {
  cancelAuthFlowAction,
  resendCodeAction,
  signOutAction,
  verifyCodeAction,
} from "./actions";
import type { ResendCodeState, VerifyCodeState } from "./action-state";
import {
  changeEmailLabel,
  overLimitCopy,
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
} from "./flow-copy";
import { authCardClassName, AuthLayout } from "./auth-layout";
import { OtpInput } from "./otp-input";

/**
 * The real verify screen of the email-code flow (004c), reached from the
 * entry screen through the HttpOnly carry cookie (or showing the signed-in
 * boundary when the session is present and the carry cookie is gone).
 *
 * The six-digit code verifies through the verify server action using the
 * carried email; failures render from the closed generic set with
 * accessible recovery. A successful verification shows the approved
 * signed-in state with the minimal local-scoped sign-out control — no
 * navigation to routes that don't exist yet (004e owns those).
 *
 * The screen never invites use of the emailed sign-in link (004d) and
 * never runs JavaScript-readable storage: only the cookie the server set
 * and this component's transient input state.
 */

type LocalError = "short-code";

export function VerifyFlowScreen({
  email,
  resendSeconds,
  signedIn = false,
}: {
  /** The carried email, displayed back to the user only. */
  email: string;
  /** The resend cooldown, read server-side from the named constant. */
  resendSeconds: number;
  /** Render the signed-in boundary directly (session without a carry). */
  signedIn?: boolean;
}) {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(() => Array(6).fill(""));
  const [seconds, setSeconds] = useState(resendSeconds);
  const [localError, setLocalError] = useState<LocalError | null>(null);
  const [errorVisible, setErrorVisible] = useState(true);
  const [verifyState, verifyFormAction] = useActionState(verifyCodeAction, {
    status: "idle",
  } as VerifyCodeState);
  const [resendState, resendAction] = useActionState(resendCodeAction, {
    status: "idle",
  } as ResendCodeState);
  const [pending, startTransition] = useTransition();
  const otpLabelId = useId();
  const messageId = useId();

  // A single recurring timer (not a self-rescheduling timeout chain): every
  // tick just decrements the displayed cooldown, so time control stays
  // deterministic under any clock.
  const counting = seconds > 0;
  useEffect(() => {
    if (!counting) return;
    const interval = window.setInterval(() => {
      setSeconds((current) => (current > 0 ? current - 1 : current));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [counting]);

  // A missing, malformed, or expired carry cookie means the flow must
  // restart at the entry screen; the server action reports it, this screen
  // navigates there, and no claim of failure is invented.
  useEffect(() => {
    if (verifyState.status === "restart" || resendState.status === "restart") {
      router.replace("/auth");
    }
  }, [verifyState.status, resendState.status, router]);

  // The countdown and input reset happen in the resend handler (not in an
  // effect): the displayed cooldown restarts from the named server-side
  // constant, and the provider's response still governs the outcome.
  function resend() {
    setSeconds(resendSeconds);
    setDigits(Array(6).fill(""));
    setLocalError(null);
    setErrorVisible(true);
    resendAction();
  }

  if (signedIn || verifyState.status === "verified") {
    return (
      <SignedInFrame
        email={email}
        onSignOut={() => startTransition(() => void signOutAction())}
        pending={pending}
      />
    );
  }

  function updateDigits(next: string[]) {
    setDigits(next);
    setLocalError(null);
    setErrorVisible(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    if (digits.join("").length < 6) {
      event.preventDefault();
      setLocalError("short-code");
    }
  }

  const verifyFailure =
    verifyState.status === "error" && errorVisible
      ? verifyState.failure
      : undefined;
  const resendFailure =
    resendState.status === "error" ? resendState.failure : undefined;
  const overLimit =
    verifyFailure === "over-limit" || resendFailure === "over-limit";
  const alertCopy = overLimit
    ? undefined
    : localError === "short-code" || verifyFailure === "invalid-code"
      ? shortCodeCopy
      : verifyFailure === "rejected-code"
        ? rejectedCodeCopy
        : verifyFailure === "unavailable" || resendFailure === "unavailable"
          ? unavailableCopy
          : undefined;

  return (
    <AuthLayout
      back={{
        href: "/auth",
        label: changeEmailLabel,
        action: cancelAuthFlowAction,
      }}
    >
      <div className={authCardClassName}>
        <h1 className="text-center font-display text-4xl leading-[1] font-extrabold tracking-tight sm:text-display-xl">
          {verifyHeading}
        </h1>
        <p className="mt-3 text-center text-lg text-content-secondary">
          {verifyIntroText(email)}
        </p>

        <form
          action={verifyFormAction}
          onSubmit={submit}
          noValidate
          className="mt-7"
        >
          <input type="hidden" name="code" value={digits.join("")} />
          <p
            id={otpLabelId}
            className="mb-2 text-center text-sm font-bold text-content-primary"
          >
            Six-digit code
          </p>
          <OtpInput
            digits={digits}
            onChange={updateDigits}
            invalid={Boolean(alertCopy)}
            labelledBy={otpLabelId}
            describedBy={messageId}
          />

          {overLimit ? (
            <div
              id={messageId}
              role="alert"
              className="mt-4 rounded-surface-lg border-2 border-outline-strong bg-accent-highlight-soft p-4 text-sm"
            >
              <p className="flex items-center gap-2 font-bold text-content-primary">
                <ClockIcon className="h-4 w-4" /> Hold on.
              </p>
              <p className="mt-1 text-content-secondary">{overLimitCopy}</p>
            </div>
          ) : null}
          {alertCopy && !overLimit ? (
            <p
              id={messageId}
              role="alert"
              className="mt-3 flex items-start gap-2 text-sm font-semibold text-feedback-error"
            >
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {alertCopy}
            </p>
          ) : null}

          <button
            type="submit"
            className={cx(
              "mt-6",
              `${buttonClassName({ variant: "primary", size: "lg" })} w-full`,
            )}
          >
            {verifySubmitLabel}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          {seconds > 0 ? (
            <span
              className="inline-flex h-11 items-center font-semibold text-content-muted"
              aria-live="polite"
            >
              {resendCountdownLabel(seconds)}
            </span>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={resend}
              className="inline-flex h-11 items-center font-bold underline decoration-2 underline-offset-4 hover:text-action-primary-strong"
            >
              {resendButtonLabel}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => void cancelAuthFlowAction())}
            className="inline-flex h-11 items-center font-bold underline decoration-2 underline-offset-4 hover:text-action-primary-strong"
          >
            {changeEmailLabel}
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}

/**
 * The approved signed-in boundary: the success treatment, an honest
 * statement of what happened, and the minimal local-scoped sign-out.
 * Nothing navigates to routes that don't exist yet.
 */
function SignedInFrame({
  email,
  onSignOut,
  pending,
}: {
  email: string;
  onSignOut: () => void;
  pending: boolean;
}) {
  return (
    <AuthLayout>
      <div className={cx(authCardClassName, "text-center")}>
        <div className="flex flex-col items-center">
          <span className="flex h-20 w-20 -rotate-6 items-center justify-center rounded-full border-2 border-outline-strong bg-accent-fresh shadow-chunk-sm">
            <CheckIcon className="h-9 w-9" strokeWidth={3} />
          </span>
          <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight">
            {signedInHeading}
          </h1>
          <p className="mt-2 text-content-secondary">{signedInText(email)}</p>
          <button
            type="button"
            onClick={onSignOut}
            disabled={pending}
            className={cx(
              "mt-7",
              `${buttonClassName({ variant: "primary", size: "lg" })} w-full`,
            )}
          >
            {signOutLabel}
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
