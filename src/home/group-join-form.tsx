"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { inviteDestination } from "./groups-index-input";

export function GroupJoinForm() {
  const router = useRouter();
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      noValidate
      aria-labelledby="group-join-title"
      className="rounded-surface-xl border-2 border-outline-strong bg-surface-sunken p-6 sm:p-7"
      onSubmit={(event) => {
        event.preventDefault();
        const destination = inviteDestination(invite, window.location.origin);
        if (!destination) {
          setError(
            invite.trim()
              ? "That doesn’t look like an invite for this Get Me This site. Paste the complete link your friend sent."
              : "Paste the link your friend sent you.",
          );
          input.current?.focus();
          return;
        }
        setError("");
        router.push(destination);
      }}
    >
      <h2
        id="group-join-title"
        className="font-display text-2xl font-extrabold leading-tight"
      >
        Join a group
      </h2>
      <p className="mt-2 text-[15px] text-content-secondary">
        Have an invite link from a friend? Drop it in to review their
        invitation.
      </p>
      <label htmlFor="group-invite-link" className="sr-only">
        Invite link
      </label>
      <input
        ref={input}
        id="group-invite-link"
        type="url"
        inputMode="url"
        autoComplete="off"
        maxLength={2048}
        value={invite}
        onChange={(event) => {
          setInvite(event.target.value);
          setError("");
        }}
        placeholder="Paste invite link…"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "group-invite-error" : undefined}
        data-ph-no-capture
        className={`ph-no-capture mt-4 h-12 w-full min-w-0 rounded-control border-2 bg-surface-raised px-3.5 text-base placeholder:text-content-muted ${error ? "border-feedback-error" : "border-outline-strong"}`}
      />
      {error && (
        <p
          id="group-invite-error"
          role="alert"
          className="mt-2 text-sm font-semibold text-feedback-error"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        className="mt-4 inline-flex h-12 items-center rounded-surface border-2 border-outline-strong bg-surface-raised px-5 font-bold hover:bg-surface-page"
      >
        Join with a link
      </button>
    </form>
  );
}
