"use client";

import { useActionState, useId, useState, type FormEvent } from "react";

import { buttonClassName, cx } from "@/src/ui/styles";
import { ArrowRightIcon, MailIcon } from "@/src/landing/icons";
import {
  AuthLayout,
  authCardClassName,
  authInputClassName,
} from "@/src/auth/auth-layout";
import { OtpInput } from "@/src/auth/otp-input";
import { brokeredServerAction, runInvitationMutation } from "./mutation-broker";

import {
  reconcileInvitationAction,
  requestInvitationEmailAction,
  restartInvitationAuthAction,
  verifyInvitationCodeAction,
  verifyInvitationLinkAction,
  type InviteEmailState,
  type InviteLinkState,
  type InviteVerifyState,
} from "./invite-actions";

/**
 * The dedicated signed-out invitation authentication screens (brief 006c).
 * They reuse the approved presentational auth primitives but keep ALL
 * state and actions flow-specific: every form posts under its own flow id,
 * reads the requested email only from the sealed flow cookie, and never
 * touches the generic auth carry. All are no-store/no-referrer surfaces
 * without analytics.
 */

const EMAIL_COPY = {
  heading: "Join with your email.",
  help: "We'll send a six-digit code and a sign-in link. Verify to continue joining — nothing is joined until you confirm on the next screen.",
  pending: "Sending the code…",
  codeLabel: "Enter the code",
  codeHelp: "It expires soon. We also sent a sign-in link you can use instead.",
} as const;

function copyFor(state: InviteEmailState): string | null {
  switch (state.status) {
    case "invalid-email":
      return "Enter a valid email address.";
    case "restart":
      return "This invitation was already started with a different email. Reopen the original invitation link to start again.";
    case "over-limit":
      return "Too many attempts. Wait a moment and try again.";
    case "unavailable":
      return "This invite isn't available. Ask the organizer for a new link.";
    case "provider":
      return "We couldn't send the email. Try again in a moment.";
    default:
      return null;
  }
}

export function InviteEmailScreen({
  flowId,
  blocked = false,
}: {
  readonly flowId: string;
  /** A broker-blocked restart returned the person here; nothing changed. */
  readonly blocked?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    requestInvitationEmailAction,
    {
      status: "idle",
    } as InviteEmailState,
  );
  const [email, setEmail] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const errorId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    const value = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      event.preventDefault();
      setClientError("Enter a valid email address.");
      return;
    }
    setClientError(null);
  }

  const error = clientError ?? copyFor(state);

  return (
    <AuthLayout>
      <div className={authCardClassName}>
        <h1 className="text-center font-display text-4xl leading-[1] font-extrabold tracking-tight sm:text-display-xl">
          {EMAIL_COPY.heading}
        </h1>
        {blocked ? (
          <p
            role="alert"
            className="mt-4 rounded-surface bg-accent-highlight-soft px-4 py-3 text-center text-sm font-bold"
          >
            Another sign-in or sign-out is finishing up in a different tab. The
            restart didn&apos;t run — nothing changed. Try again in a moment.
          </p>
        ) : null}
        <form
          action={formAction}
          onSubmit={submit}
          noValidate
          className="mt-7 flex flex-col gap-4"
        >
          <input type="hidden" name="flowId" value={flowId} />
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
                aria-describedby={error ? errorId : undefined}
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
            {pending ? EMAIL_COPY.pending : "Continue with email"}
            {pending ? null : <ArrowRightIcon className="h-5 w-5" />}
          </button>
          <p className="text-center text-sm text-content-muted">
            {EMAIL_COPY.help}
          </p>
        </form>
      </div>
    </AuthLayout>
  );
}

function mismatchCopy(): string {
  return "This invitation flow was verified for a different account. Log out to restart sign-in for this invitation, or reopen the original invitation link.";
}

export function InviteVerifyScreen({
  flowId,
  maskedEmail,
}: {
  readonly flowId: string;
  readonly maskedEmail: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    brokeredServerAction(verifyInvitationCodeAction),
    {
      status: "idle",
    } as InviteVerifyState,
  );
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const headingId = useId();
  const errorId = useId();
  const [restarting, setRestarting] = useState(false);

  // The confirmed restart is a session mutation: it runs under the same
  // origin-wide broker lock (its server action holds the coordinator
  // lease). A restart failure redirects back to the email screen with the
  // honest failure flag — never a claimed success.
  async function restart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRestarting(true);
    try {
      await runInvitationMutation(() =>
        restartInvitationAuthAction(new FormData(event.currentTarget)),
      );
    } catch {
      setRestarting(false);
    }
  }

  const error =
    state.status === "invalid-code"
      ? "That code didn't work. Check it and try again."
      : state.status === "mismatch"
        ? mismatchCopy()
        : state.status === "restart"
          ? "This sign-in no longer matches this invitation. Reopen the original invitation link and start again."
          : state.status === "provider"
            ? "That code didn't work. Request a fresh one and try again."
            : state.status === "over-limit"
              ? "Too many attempts. Wait a moment and try again."
              : state.status === "unavailable"
                ? "This invite isn't available. Ask the organizer for a new link."
                : state.status === "blocked"
                  ? "Another sign-in or sign-out is finishing up in a different tab. Try again in a moment."
                  : null;

  return (
    <AuthLayout>
      <div className={authCardClassName}>
        <h1
          id={headingId}
          className="text-center font-display text-4xl leading-[1] font-extrabold tracking-tight sm:text-display-xl"
        >
          {EMAIL_COPY.codeLabel}
        </h1>
        {maskedEmail ? (
          <p className="mt-3 text-center text-lg text-content-secondary">
            We sent a six-digit code to {maskedEmail}.
          </p>
        ) : null}
        <form
          action={formAction}
          noValidate
          className="mt-7 flex flex-col gap-4"
        >
          <input type="hidden" name="flowId" value={flowId} />
          <input type="hidden" name="code" value={digits.join("")} />
          <OtpInput
            digits={digits}
            onChange={setDigits}
            invalid={Boolean(error)}
            disabled={pending}
            labelledBy={headingId}
            describedBy={error ? errorId : undefined}
          />
          {error ? (
            <p
              id={errorId}
              role="alert"
              className="text-sm font-semibold text-feedback-error"
            >
              {error}
            </p>
          ) : null}
          {state.status === "mismatch" ? (
            <form onSubmit={restart}>
              <input type="hidden" name="flowId" value={flowId} />
              <button
                type="submit"
                disabled={pending || restarting}
                className={cx(
                  buttonClassName({ variant: "secondary", size: "lg" }),
                  "w-full",
                )}
              >
                {restarting ? "Signing out…" : "Log out and restart sign-in"}
              </button>
            </form>
          ) : (
            <button
              type="submit"
              disabled={pending}
              className={cx(
                "mt-1",
                `${buttonClassName({ variant: "primary", size: "lg" })} w-full`,
              )}
            >
              {pending ? "Checking the code…" : "Verify"}
            </button>
          )}
          <p className="text-center text-sm text-content-muted">
            {EMAIL_COPY.codeHelp}
          </p>
        </form>
      </div>
    </AuthLayout>
  );
}

/**
 * The clean reconciliation screen between provider delivery and continuation
 * binding (brief 006c): the session cookies are already applied; the
 * explicit POST is what binds them to this flow. Never re-verifies, never
 * accepts.
 */
export function InviteReconcileScreen({ flowId }: { readonly flowId: string }) {
  const [state, formAction, pending] = useActionState(
    reconcileInvitationAction,
    {
      status: "idle",
    } as InviteVerifyState,
  );

  const restart = state.status === "restart" || state.status === "unavailable";
  // An unacknowledged broker delivery (criterion 12): the server lease is
  // still in delivery_pending — the person retries in a moment; this is
  // not a terminal failure and nothing claims one.
  const unacknowledged = state.status === "unacknowledged";

  return (
    <AuthLayout>
      <div className={authCardClassName}>
        <h1 className="text-center font-display text-4xl leading-[1] font-extrabold tracking-tight sm:text-display-xl">
          You&apos;re signed in.
        </h1>
        <p className="mt-3 text-center text-lg text-content-secondary">
          Continue this invitation to pick up where you left off. Nothing is
          joined yet.
        </p>
        {restart ? (
          <p
            role="alert"
            className="mt-4 rounded-surface bg-accent-highlight-soft px-4 py-3 text-center text-sm font-bold"
          >
            This invitation could not be continued from this session. Reopen the
            original invitation link.
          </p>
        ) : null}
        {unacknowledged ? (
          <p
            role="alert"
            className="mt-4 rounded-surface bg-accent-highlight-soft px-4 py-3 text-center text-sm font-bold"
          >
            Finishing the sign-in from your other tab. Try again in a moment.
          </p>
        ) : null}
        <form action={formAction} className="mt-7 flex flex-col gap-4">
          <input type="hidden" name="flowId" value={flowId} />
          <button
            type="submit"
            disabled={pending || restart}
            className={cx(
              `${buttonClassName({ variant: "primary", size: "lg" })} w-full`,
            )}
          >
            {pending ? "Continuing…" : "Continue this invitation"}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}

export function InviteLinkScreen({ flowId }: { readonly flowId: string }) {
  const [state, formAction, pending] = useActionState(
    brokeredServerAction(verifyInvitationLinkAction),
    {
      status: "idle",
    } as InviteLinkState,
  );
  const [restarting, setRestarting] = useState(false);

  async function restart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRestarting(true);
    try {
      await runInvitationMutation(() =>
        restartInvitationAuthAction(new FormData(event.currentTarget)),
      );
    } catch {
      setRestarting(false);
    }
  }

  const error =
    state.status === "mismatch"
      ? mismatchCopy()
      : state.status === "restart"
        ? "This sign-in link doesn't belong to this browser or invitation. Return to the browser where the invitation was opened and use the code, or reopen the original invitation link."
        : state.status === "provider"
          ? "That link didn't work. Request a fresh code or link and try again."
          : state.status === "blocked"
            ? "Another sign-in or sign-out is finishing up in a different tab. Try again in a moment."
            : null;

  return (
    <AuthLayout>
      <div className={authCardClassName}>
        <h1 className="text-center font-display text-4xl leading-[1] font-extrabold tracking-tight sm:text-display-xl">
          Use your sign-in link.
        </h1>
        <p className="mt-3 text-center text-lg text-content-secondary">
          Confirm below to finish signing in and return to the invitation.
          Nothing is joined until you confirm Join on the next screen.
        </p>
        {error ? (
          <p
            role="alert"
            className="mt-4 text-center text-sm font-semibold text-feedback-error"
          >
            {error}
          </p>
        ) : null}
        {state.status === "mismatch" ? (
          <form onSubmit={restart} className="mt-4">
            <input type="hidden" name="flowId" value={flowId} />
            <button
              type="submit"
              disabled={pending || restarting}
              className={cx(
                buttonClassName({ variant: "secondary", size: "lg" }),
                "w-full",
              )}
            >
              {restarting ? "Signing out…" : "Log out and restart sign-in"}
            </button>
          </form>
        ) : (
          <form action={formAction} className="mt-7 flex flex-col gap-4">
            <input type="hidden" name="flowId" value={flowId} />
            <button
              type="submit"
              disabled={pending}
              className={cx(
                `${buttonClassName({ variant: "primary", size: "lg" })} w-full`,
              )}
            >
              {pending ? "Checking the link…" : "Use my sign-in link"}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
