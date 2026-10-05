"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { inviteActionClassName } from "./invite-action-styles";
import type {
  GetGroupInviteLinkResult,
  IssueLinkActionResult,
} from "./action-state";

type Actions = {
  load: (groupId: string) => Promise<GetGroupInviteLinkResult>;
  replace: (groupId: string, version: string) => Promise<IssueLinkActionResult>;
};
const actions: Actions = {
  load: async (id) =>
    (await import("./invitation-actions")).getGroupInviteLinkAction(id),
  replace: async (id, version) =>
    (await import("./invitation-actions")).issueGroupInviteLinkAction(
      id,
      version,
    ),
};

export function InvitePeopleButton({
  groupId,
  groupName,
  inviteActions = actions,
}: {
  groupId: string;
  groupName: string;
  inviteActions?: Actions;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={inviteActionClassName()}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="9" cy="7" r="3" />
          <path d="M3 21v-3a6 6 0 0 1 12 0v3M19 8v6m-3-3h6" />
        </svg>
        Invite people
      </button>
      {open
        ? createPortal(
            <InviteModal
              groupId={groupId}
              groupName={groupName}
              actions={inviteActions}
              onClose={close}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function InviteModal({
  groupId,
  groupName,
  actions,
  onClose,
}: {
  groupId: string;
  groupName: string;
  actions: Actions;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<GetGroupInviteLinkResult | null>(null);
  const [pending, setPending] = useState(true);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    closeButton.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let active = true;
    actions
      .load(groupId)
      .then((value) => {
        if (active) {
          setResult(value);
          setPending(false);
        }
      })
      .catch(() => {
        if (active) {
          setResult({ ok: false, reason: "retry" });
          setPending(false);
        }
      });
    return () => {
      active = false;
      document.body.style.overflow = previous;
    };
  }, [actions, groupId]);
  const url = result?.ok
    ? `${window.location.origin}/invite/${encodeURIComponent(result.token)}`
    : null;
  async function retry(replaceVersion?: string) {
    setPending(true);
    try {
      if (replaceVersion !== undefined) {
        const replacement = await actions.replace(groupId, replaceVersion);
        setResult(replacement.ok ? replacement : await actions.load(groupId));
      } else setResult(await actions.load(groupId));
    } catch {
      setResult({ ok: false, reason: "retry" });
    } finally {
      setPending(false);
      closeButton.current?.focus();
    }
  }
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      setCopied("failed");
      input.current?.focus();
      input.current?.select();
    }
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab") return;
    const targets = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input:not(:disabled),a[href]",
      ),
    );
    const first = targets[0],
      last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  return (
    <div
      className="ph-no-capture fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-content-primary/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={keyboard}
        data-ph-no-capture
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-[32px] border-2 border-outline-strong bg-surface-page p-6 shadow-chunk sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id={titleId}
            className="min-w-0 break-words font-display text-3xl font-extrabold leading-tight tracking-tight"
          >
            {groupName} is ready.
          </h2>
          <button
            ref={closeButton}
            type="button"
            aria-label="Close invite dialog"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-outline-strong bg-surface-raised text-2xl transition-colors hover:bg-surface-sunken"
          >
            ×
          </button>
        </div>
        {pending ? (
          <p role="status" className="mt-6 text-content-secondary">
            Getting your invite link…
          </p>
        ) : url ? (
          <div className="mt-6">
            <label htmlFor={`${titleId}-link`} className="mb-2 block font-bold">
              Invite link
            </label>
            <input
              ref={input}
              id={`${titleId}-link`}
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className="min-h-14 w-full min-w-0 rounded-control border-2 border-outline-strong bg-surface-sunken px-4 text-base"
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={copy}
                className="min-h-12 cursor-pointer rounded-control border-2 border-outline-strong bg-content-primary px-4 py-3 font-bold text-surface-raised hover:opacity-90"
              >
                Copy invite link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Join ${groupName} on Get Me This: ${url}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 items-center justify-center rounded-control border-2 border-outline-strong bg-surface-raised px-4 py-3 text-center font-bold shadow-chunk-sm hover:bg-surface-sunken"
              >
                Share on WhatsApp
              </a>
            </div>
            <p role="status" className="mt-3 text-sm text-content-secondary">
              {copied === "copied"
                ? "Invite link copied"
                : copied === "failed"
                  ? "Select and copy the link above."
                  : ""}
            </p>
          </div>
        ) : result && !result.ok && result.reason === "replacement_required" ? (
          <div className="mt-6">
            <p>
              Your previous invite link wasn’t saved. Creating a new one will
              stop the old link from working.
            </p>
            <button
              type="button"
              onClick={() => retry(result.version)}
              className="mt-5 min-h-12 w-full cursor-pointer rounded-control bg-content-primary px-4 font-bold text-surface-raised"
            >
              Create a new invite link
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <p role="alert">
              {result && !result.ok && result.reason === "unavailable"
                ? "You no longer have access to invite people to this group."
                : "The invite link couldn’t be loaded. Try again."}
            </p>
            {result && !result.ok && result.reason !== "unavailable" ? (
              <button
                type="button"
                onClick={() => retry()}
                className="mt-4 min-h-11 cursor-pointer font-bold underline"
              >
                Try again
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
