"use client";

import { useActionState, useId, useState, type FormEvent } from "react";

import { buttonClassName, cx } from "@/src/ui/styles";
import { ArrowRightIcon, MailIcon } from "@/src/landing/icons";
import { requestCodeAction } from "./actions";
import type { RequestCodeState } from "./action-state";
import {
  invalidEmailCopy,
  overLimitCopy,
  requestCodeHelpText,
  requestCodePendingText,
  unavailableCopy,
} from "./flow-copy";
import { EMAIL_PATTERN } from "./email";
import type { AuthIntent } from "./fixtures";
import {
  authCardClassName,
  authInputClassName,
  AuthLayout,
} from "./auth-layout";

/**
 * The email-entry screen of the real email-code flow (004c).
 *
 * Client-side validation rejects empty and malformed input before any
 * request is made; a valid submission calls the request-code server action,
 * which re-validates, performs signInWithOtp with an allowlisted
 * emailRedirectTo, sets the HttpOnly carry cookie, and redirects to the
 * verify screen. Provider failures render from the closed generic set only
 * — nothing here distinguishes new from returning users.
 */

const EMPTY_EMAIL_ERROR = "Enter your email to continue.";

type ClientError = "empty" | "invalid";

function failureCopy(
  failure: Extract<RequestCodeState, { status: "error" }>["failure"],
) {
  switch (failure) {
    case "invalid-email":
      return invalidEmailCopy;
    case "over-limit":
      return overLimitCopy;
    case "unavailable":
      return unavailableCopy;
  }
}

export function EmailEntryForm({
  intent,
  intentNote,
}: {
  /** The parsed approved intent, carried through the server action. */
  intent: AuthIntent;
  /** Intent-specific helper copy from the frozen reference; null for home. */
  intentNote?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [clientError, setClientError] = useState<ClientError | null>(null);
  const [state, formAction, pending] = useActionState(requestCodeAction, {
    status: "idle",
  } as RequestCodeState);
  const errorId = useId();
  const helpId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    const value = email.trim();
    if (!value || !EMAIL_PATTERN.test(value)) {
      event.preventDefault();
      setClientError(value ? "invalid" : "empty");
      return;
    }
    setClientError(null);
  }

  const serverError =
    state.status === "error" ? failureCopy(state.failure) : undefined;
  const error =
    clientError === "empty"
      ? EMPTY_EMAIL_ERROR
      : clientError === "invalid"
        ? invalidEmailCopy
        : serverError;

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
        <form
          action={formAction}
          onSubmit={submit}
          noValidate
          className="mt-7 flex flex-col gap-4"
        >
          {/* The approved intent travels with the action and is re-validated
              against the closed enum server-side. */}
          <input type="hidden" name="intent" value={intent} />
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
                  if (clientError) setClientError(null);
                }}
                placeholder="you@example.com"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : helpId}
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
          <button
            type="submit"
            disabled={pending}
            className={cx(
              "mt-1",
              `${buttonClassName({ variant: "primary", size: "lg" })} w-full`,
            )}
          >
            {pending ? requestCodePendingText : "Continue with email"}
            {pending ? null : <ArrowRightIcon className="h-5 w-5" />}
          </button>
          <p id={helpId} className="text-center text-sm text-content-muted">
            {requestCodeHelpText}
          </p>
        </form>
      </div>
    </AuthLayout>
  );
}
