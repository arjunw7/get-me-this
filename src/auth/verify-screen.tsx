"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";

import { buttonClassName, cx } from "@/src/ui/styles";
import { AlertCircleIcon, ClockIcon } from "@/src/landing/icons";
import { authCardClassName, AuthLayout } from "./auth-layout";
import { InboxPreview } from "./inbox-preview";
import { OtpInput } from "./otp-input";
import { PreviewNotice } from "./preview-notice";
import {
  DEMO_CODE,
  DEMO_EMAIL,
  RESEND_SECONDS,
  type VerifyVariant,
} from "./fixtures";

/**
 * Static OTP-verification screen, ported from the frozen V18 reference
 * (pages/auth/VerifyEmail.tsx). Every designed state is a URL fixture:
 * default (no parameter), `?state=error`, `?state=expired`.
 *
 * STATIC PREVIEW BOUNDARY: no code exists and nothing is delivered or
 * verified. The countdown renders from its deterministic initial value,
 * and the preview notice is permanently visible because the screen's
 * interactions (resend, submit) could otherwise imply a delivery or a
 * completed sign-in. A complete code submits to nothing: no navigation, no
 * success claim. Documented copy differences from V18 (reviewed 2026-09-28):
 * V18's delivery-promising labels — "Send a new code" and the "Resend
 * code" link, plus the expired panel's "We'll send you a fresh one" — are
 * replaced with honest wording, because in this preview the action only
 * resets the designed resend state and nothing is delivered. These are the
 * same boundary approved for the 003a email entry; a regression test holds
 * the no-delivery-promise rule for every state.
 */

type Status = "idle" | "error" | "expired";

const SHORT_CODE_ERROR = "Enter all six digits.";
// The designed mismatch message, shown by the `?state=error` fixture and
// by an incomplete submission. No code is actually checked.
const MISMATCH_ERROR =
  "That code doesn’t match. Check the latest email and try again.";

export function VerifyScreen({ variant }: { variant: VerifyVariant }) {
  const [digits, setDigits] = useState<string[]>(
    variant === "default" ? Array(6).fill("") : DEMO_CODE.split(""),
  );
  const [status, setStatus] = useState<Status>(
    variant === "error" || variant === "expired" ? variant : "idle",
  );
  const [message, setMessage] = useState<string>(
    variant === "error" ? MISMATCH_ERROR : "",
  );
  // Deterministic initial value; the fixture states render it identically
  // for capture.
  const [seconds, setSeconds] = useState(
    variant === "expired" ? 0 : RESEND_SECONDS,
  );
  const otpLabelId = useId();
  const messageId = useId();
  const noteId = useId();
  const noticeId = useId();

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  function updateDigits(next: string[]) {
    setDigits(next);
    if (status === "error") {
      setStatus("idle");
      setMessage("");
    }
  }

  function resend() {
    // Static slice: no new email is sent. Reset the designed countdown
    // state visibly and say nothing that claims delivery.
    setSeconds(RESEND_SECONDS);
    setDigits(Array(6).fill(""));
    setStatus("idle");
    setMessage("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "expired") {
      resend();
      return;
    }
    const code = digits.join("");
    if (code.length < 6) {
      setStatus("error");
      setMessage(SHORT_CODE_ERROR);
      return;
    }
    // A complete code is not verified here: nothing is sent, checked, or
    // signed in. The permanent preview notice says so.
    setStatus("idle");
    setMessage("");
  }

  const minutes = Math.floor(seconds / 60);
  const secondsText = String(seconds % 60).padStart(2, "0");

  return (
    <AuthLayout
      aside={<InboxPreview />}
      back={{ href: "/auth", label: "Change email" }}
    >
      <div className={authCardClassName}>
        <h1 className="text-center font-display text-4xl leading-[1] font-extrabold tracking-tight sm:text-display-xl">
          Check your inbox.
        </h1>
        <p className="mt-3 text-center text-lg text-content-secondary">
          This is the sign-in email design for{" "}
          <span className="font-bold text-content-primary">{DEMO_EMAIL}</span> —
          a six-digit code and a sign-in link.
        </p>

        <form onSubmit={submit} noValidate className="mt-7">
          <p
            id={otpLabelId}
            className="mb-2 text-center text-sm font-bold text-content-primary"
          >
            Six-digit code
          </p>
          <OtpInput
            digits={digits}
            onChange={updateDigits}
            invalid={status === "error"}
            disabled={status === "expired"}
            labelledBy={otpLabelId}
            describedBy={status === "idle" ? noticeId : messageId}
          />

          {status === "error" ? (
            <p
              id={messageId}
              role="alert"
              className="mt-3 flex items-start gap-2 text-sm font-semibold text-feedback-error"
            >
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {message}
            </p>
          ) : null}
          {status === "expired" ? (
            <div
              id={messageId}
              role="alert"
              className="mt-4 rounded-surface-lg border-2 border-outline-strong bg-accent-highlight-soft p-4 text-sm"
            >
              <p className="flex items-center gap-2 font-bold text-content-primary">
                <ClockIcon className="h-4 w-4" /> That code has expired.
              </p>
              <p className="mt-1 text-content-secondary">
                Codes last 10 minutes. In the real product, a resend starts a
                fresh one.
              </p>
            </div>
          ) : null}

          <button
            type="submit"
            className={cx(
              "mt-6",
              `${buttonClassName({ variant: "primary", size: "lg" })} w-full`,
            )}
          >
            {status === "expired" ? "Start a new code" : "Verify and continue"}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          {seconds > 0 ? (
            <span
              className="inline-flex h-11 items-center font-semibold text-content-muted"
              aria-live="polite"
            >
              Resend code in {minutes}:{secondsText}
            </span>
          ) : (
            <button
              type="button"
              onClick={resend}
              className="inline-flex h-11 items-center font-bold underline decoration-2 underline-offset-4 hover:text-action-primary-strong"
            >
              Start a new code
            </button>
          )}
          <Link
            href="/auth"
            className="inline-flex h-11 items-center font-bold underline decoration-2 underline-offset-4 hover:text-action-primary-strong"
          >
            Change email
          </Link>
        </div>

        <p
          id={noteId}
          className="mt-4 border-t-2 border-dashed border-outline-strong/10 pt-4 text-sm text-content-secondary"
        >
          Enter the code here, or tap the sign-in button in the email. Either
          works.
        </p>
        <div className="mt-4">
          <PreviewNotice id={noticeId} />
        </div>
      </div>
    </AuthLayout>
  );
}
