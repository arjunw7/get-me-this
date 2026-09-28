"use client";

import { useId, useState, type FormEvent } from "react";

import { buttonClassName, cx } from "@/src/ui/styles";
import { ArrowRightIcon, MailIcon } from "@/src/landing/icons";
import { emailHelpText } from "./copy";
import { PreviewNotice } from "./preview-notice";
import {
  authCardClassName,
  authInputClassName,
  AuthLayout,
} from "./auth-layout";

/**
 * Static email-entry screen, ported from the frozen V18 reference
 * (pages/auth/AuthEmail.tsx). 003b adds the intent helper notes; the
 * `home` intent (and a bare route) renders the 003a default state.
 *
 * STATIC PREVIEW BOUNDARY: this slice has no backend. Client-side
 * validation works exactly as designed; a valid submission performs no
 * navigation and sends nothing. No copy on this screen promises a code or
 * a sign-in: the helper text and empty-email error are neutral, and a
 * valid submit reveals the explicit preview notice (src/auth/copy.ts).
 * These are documented copy differences from V18 (approved for this
 * slice).
 *
 * Phase 3 adds the real verification flow (Supabase + Resend delivery).
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// No delivery promise anywhere: the static slice sends nothing.
const EMPTY_EMAIL_ERROR = "Enter your email to continue.";
const INVALID_EMAIL_ERROR = "That email looks a little off. Check for typos?";

type FormState =
  { kind: "idle" } | { kind: "error"; message: string } | { kind: "preview" };

export function EmailEntryForm({
  intentNote,
}: {
  /** Intent-specific helper copy from the frozen reference; null for home. */
  intentNote?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const errorId = useId();
  const helpId = useId();
  const noticeId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim();
    if (!value) {
      setState({ kind: "error", message: EMPTY_EMAIL_ERROR });
      return;
    }
    if (!EMAIL_PATTERN.test(value)) {
      setState({ kind: "error", message: INVALID_EMAIL_ERROR });
      return;
    }
    // Static slice: nothing is sent and nobody is signed in. Say so.
    setState({ kind: "preview" });
  }

  const error = state.kind === "error" ? state.message : undefined;

  return (
    <AuthLayout>
      <div className={authCardClassName}>
        {intentNote ? (
          <p className="mb-5 rounded-surface bg-accent-highlight-soft px-4 py-3 text-center text-sm font-semibold">
            {intentNote}
          </p>
        ) : null}
        <h1 className="text-center font-display text-4xl leading-[1] font-extrabold tracking-tight sm:text-display-xl">
          Welcome to Get Me This.
        </h1>
        <p className="mt-3 text-center text-lg text-content-secondary">
          Enter your email to start a wishlist, join a group, or pick up where
          you left off.
        </p>
        <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">
          <label className="block">
            <span className="text-sm font-bold">Email</span>
            <div className="relative">
              <MailIcon className="pointer-events-none absolute top-1/2 left-4 mt-[3px] h-5 w-5 -translate-y-1/2 text-content-muted" />
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (state.kind !== "preview") setState({ kind: "idle" });
                }}
                placeholder="you@example.com"
                aria-invalid={error ? true : undefined}
                aria-describedby={
                  error ? errorId : state.kind === "preview" ? noticeId : helpId
                }
                className={authInputClassName({ invalid: Boolean(error) })}
              />
            </div>
          </label>
          {error ? (
            <p
              id={errorId}
              role="alert"
              className="-mt-2 text-sm font-semibold text-feedback-error"
            >
              {error}
            </p>
          ) : null}
          {state.kind === "preview" ? <PreviewNotice id={noticeId} /> : null}
          <button
            type="submit"
            className={cx(
              "mt-1",
              `${buttonClassName({ variant: "primary", size: "lg" })} w-full`,
            )}
          >
            Continue with email
            <ArrowRightIcon className="h-5 w-5" />
          </button>
          <p id={helpId} className="text-center text-sm text-content-muted">
            {emailHelpText}
          </p>
        </form>
      </div>
    </AuthLayout>
  );
}
