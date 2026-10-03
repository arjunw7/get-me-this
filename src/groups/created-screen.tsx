"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/src/ui/button";

import type { InvitationStateActionResult } from "./action-state";

/**
 * The organizer-only `/groups/[groupId]/created` screen (brief 006b).
 *
 * Six explicit states over one durable invitation projection plus one
 * page-memory token:
 *   1. never_issued            — success heading + "Create invite link".
 *   2. token in page memory    — opaque link, copy, WhatsApp, expiry.
 *   3. active but token lost   — reload/ambiguous response: links are shown
 *                                only once; "Create a new invite link" with
 *                                confirmation.
 *   4. issued_expired          — authoritative stored expiry; replacement
 *                                requires confirmation.
 *   5. revoked                 — no active link; "Create invite link".
 *   6. stale issuance          — refreshed projection decides the state;
 *                                never an automatic retry.
 *
 * The raw token lives only in this component's state: the server renders it
 * nowhere, and navigation or reload discards it permanently.
 */

export type InvitationStateName =
  "never_issued" | "active" | "issued_expired" | "revoked";

export interface CreatedScreenProps {
  readonly groupId: string;
  readonly groupName: string;
  readonly initialState: {
    readonly version: string;
    readonly state: InvitationStateName;
    readonly expiresAt: string | null;
  };
  readonly issueAction: (
    groupId: string,
    expectedVersion: string,
  ) => Promise<
    | {
        ok: true;
        token: string;
        version: string;
        expiresAt: string;
      }
    | { ok: false; reason: "stale" | "unavailable" | "retry" }
  >;
  readonly refreshAction: (
    groupId: string,
  ) => Promise<InvitationStateActionResult>;
}

type InvitationView = {
  version: string;
  state: InvitationStateName;
  expiresAt: string | null;
};

export function CreatedScreen({
  groupId,
  groupName,
  initialState,
  issueAction,
  refreshAction,
}: CreatedScreenProps) {
  const [invitation, setInvitation] = useState<InvitationView>({
    ...initialState,
  });
  const [token, setToken] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  // The authoritative expiry is rendered from the projected/returned stored
  // value, formatted with the pinned deterministic locale and zone. The text
  // is computed at render time; the containing elements carry
  // suppressHydrationWarning (text-only drift).
  const expiryText = useMemo(
    () => formatExpiry(invitation.expiresAt),
    [invitation.expiresAt],
  );

  const linkHref = token ? inviteUrl(token) : null;

  async function issue(expectedVersion: string): Promise<void> {
    setPending(true);
    try {
      const result = await issueAction(groupId, expectedVersion);
      if (result.ok) {
        setToken(result.token);
        setStale(false);
        setConfirmReplacement(false);
        setCopyFailed(false);
        setInvitation({
          version: result.version,
          state: "active",
          expiresAt: result.expiresAt,
        });
        return;
      }
      if (result.reason === "stale") {
        await refreshAfterStale();
        return;
      }
      if (result.reason === "retry") {
        // An ambiguous issuance: the response may have committed. The page
        // must NOT retry automatically — the organizer decides explicitly.
        setStale(true);
        await refreshAfterStale();
        return;
      }
      setStale(true);
    } finally {
      setPending(false);
    }
  }

  async function refreshAfterStale(): Promise<void> {
    const refreshed = await refreshAction(groupId);
    if (refreshed.ok) {
      setToken(null);
      setInvitation({
        version: refreshed.version,
        state: refreshed.state,
        expiresAt: refreshed.expiresAt,
      });
    }
    setStale(true);
  }

  async function copyLink(): Promise<void> {
    if (!linkHref) return;
    try {
      await navigator.clipboard.writeText(linkHref);
      setCopyFailed(false);
      setCopied(true);
    } catch {
      // Never clears the only displayed token; the link stays selectable.
      setCopied(false);
      setCopyFailed(true);
    }
  }

  const state = invitation.state;

  return (
    <div className="mx-auto w-full max-w-2xl px-gutter py-10 sm:py-14">
      <span className="inline-flex h-16 w-16 -rotate-6 items-center justify-center rounded-pill border-2 border-outline-strong bg-accent-fresh shadow-chunk-sm">
        <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
          <path
            d="M4 12.5 9.5 18 20 6.5"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </span>
      <h1 className="mt-6 font-display text-display-lg leading-[1.02] tracking-tight">
        {groupName} is ready.
      </h1>

      {state === "never_issued" || state === "revoked" ? (
        <>
          <p className="mt-3 text-lg text-content-secondary">
            Now bring your people. Create a shareable invite link when you are
            ready — it is shown only once.
          </p>
          <div className="mt-8">
            <Button
              size="lg"
              onClick={() => {
                void issue(invitation.version);
              }}
              disabled={pending}
            >
              {pending ? "Creating link…" : "Create invite link"}
            </Button>
          </div>
        </>
      ) : null}

      {token && linkHref ? (
        <div
          className="mt-8 rounded-surface-2xl border-2 border-outline-strong bg-surface-raised p-5 shadow-chunk"
          data-testid="invite-link-card"
        >
          <p className="text-label font-bold">Invite link</p>
          <p className="mt-1.5 truncate rounded-control bg-surface-sunken px-3 py-3 font-semibold">
            <span className="select-all">{linkHref}</span>
          </p>
          <p
            className="mt-2 text-caption text-content-secondary"
            suppressHydrationWarning
          >
            Anyone with this link can preview the group and join. It expires{" "}
            {expiryText ?? "at the stored expiry"}.
          </p>
          {copied ? (
            <p role="status" className="mt-2 text-caption font-bold">
              Invite link copied
            </p>
          ) : null}
          {copyFailed ? (
            <p
              role="alert"
              className="mt-2 text-caption font-bold text-feedback-error"
            >
              Copying failed. Select the link above and copy it manually.
            </p>
          ) : null}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button
              variant="contrast"
              onClick={() => {
                void copyLink();
              }}
              disabled={pending}
            >
              Copy invite link
            </Button>
            <a
              href={whatsappHref(groupName, linkHref)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-control-md items-center justify-center gap-2 rounded-control border-2 border-outline-strong bg-surface-raised font-display text-label font-bold shadow-chunk-sm transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            >
              Share on WhatsApp
            </a>
          </div>
        </div>
      ) : null}

      {state === "active" && !token ? (
        <div
          className="mt-8 rounded-surface-2xl border-2 border-outline-strong bg-surface-raised p-5 shadow-chunk"
          data-testid="active-link-lost"
        >
          <p className="text-label font-bold">
            An invite link is active, but it was shown only once and cannot be
            recovered.
          </p>
          {expiryText ? (
            <p
              className="mt-2 text-caption text-content-secondary"
              suppressHydrationWarning
            >
              It expires {expiryText}.
            </p>
          ) : null}
          <ReplacementConfirmation
            confirmReplacement={confirmReplacement}
            setConfirmReplacement={setConfirmReplacement}
            pending={pending}
            onConfirm={() => {
              void issue(invitation.version);
            }}
            confirmLabel="Create a new invite link"
            confirmCopy="A replacement link will be created and the previous link will stop working."
          />
        </div>
      ) : null}

      {state === "issued_expired" ? (
        <div
          className="mt-8 rounded-surface-2xl border-2 border-outline-strong bg-surface-raised p-5 shadow-chunk"
          data-testid="issued-expired"
        >
          <p className="text-label font-bold" suppressHydrationWarning>
            Your invite link expired{expiryText ? ` on ${expiryText}` : ""} and
            no longer works.
          </p>
          <ReplacementConfirmation
            confirmReplacement={confirmReplacement}
            setConfirmReplacement={setConfirmReplacement}
            pending={pending}
            onConfirm={() => {
              void issue(invitation.version);
            }}
            confirmLabel="Create a new invite link"
            confirmCopy="A replacement link will be created and the expired link will remain unusable."
          />
        </div>
      ) : null}

      {stale ? (
        <p
          role="alert"
          className="mt-4 text-caption font-bold text-content-secondary"
          data-testid="stale-version-note"
        >
          Another tab may have changed this link. The state above was just
          refreshed — create a new link only when you are ready.
        </p>
      ) : null}

      <div className="mt-10 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/wishlist"
          className="inline-flex h-control-lg items-center justify-center rounded-surface-lg border-2 border-outline-strong bg-action-primary px-6 font-display text-heading font-bold shadow-chunk transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          Add to my wishlist
        </Link>
        {/* The committed group is the only destination this state links for
            the room (brief 006d): the organizer's own group id, never a
            client-supplied one. On mobile the room action shares the fallback
            row so the pinned created-screen composition keeps its row count;
            on desktop the wrapper dissolves and all three actions stay in the
            approved single row. */}
        <div className="flex items-center gap-4 sm:contents">
          <Link
            href={`/groups/${groupId}`}
            data-testid="open-group"
            className="inline-flex h-control-lg items-center justify-center rounded-surface-lg border-2 border-outline-strong bg-surface-raised px-6 font-display text-heading font-bold shadow-chunk-sm transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Open group
          </Link>
          <Link
            href="/home"
            className="inline-flex h-control-lg items-center justify-center rounded-surface-lg px-6 font-display text-heading font-bold underline-offset-4 hover:underline"
          >
            Go to home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ReplacementConfirmation(options: {
  confirmReplacement: boolean;
  setConfirmReplacement: (value: boolean) => void;
  pending: boolean;
  onConfirm: () => void;
  confirmLabel: string;
  confirmCopy: string;
}) {
  if (!options.confirmReplacement) {
    return (
      <div className="mt-4">
        <Button
          variant="secondary"
          onClick={() => options.setConfirmReplacement(true)}
          disabled={options.pending}
        >
          {options.confirmLabel}
        </Button>
      </div>
    );
  }
  return (
    <div
      className="mt-4 rounded-surface border-2 border-outline-strong bg-accent-highlight-soft p-4"
      data-testid="replacement-confirmation"
    >
      <p className="text-label font-bold">{options.confirmCopy}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={options.onConfirm} disabled={options.pending}>
          {options.pending ? "Creating link…" : "Yes, create a new link"}
        </Button>
        <Button
          variant="subtle"
          onClick={() => options.setConfirmReplacement(false)}
          disabled={options.pending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The production link shape: the opaque token route, never a name slug. */
export function inviteUrl(token: string): string {
  if (typeof window === "undefined") return `/invite/${token}`;
  return `${window.location.origin}/invite/${token}`;
}

/**
 * Human-readable stored expiry; null when absent or unparseable.
 *
 * The locale and time zone are pinned (en-IN, Asia/Kolkata) so the rendered
 * expiry is byte-identical across server/client locales, browser devices,
 * and visual-baseline captures — the brief's deterministic visual contract.
 * The stored value itself stays the authoritative instant; only its
 * presentation is pinned.
 */
export function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(parsed);
}

function whatsappHref(groupName: string, link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(
    `Join ${groupName} on Get Me This: ${link}`,
  )}`;
}
