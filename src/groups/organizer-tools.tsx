"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/src/ui/button";
import { DeleteGroupControl } from "./delete-group-control";

import type {
  DeleteGroupResult,
  MemberAdminActionResult,
  ReinviteActionResult,
} from "./action-state";
import type {
  AdminAuditEntry,
  AdminLiveInvitation,
  AdminRosterMember,
} from "./member-admin-data";
import {
  ADMIN_AUDIT_EMPTY_TEXT,
  adminAuditText,
  adminStatusLabel,
  memberAdminActions,
  targetedInviteLink,
  type OrganizerToolAction,
} from "./member-admin-view";

/**
 * The organizer membership tools (brief 006f): a disclosure inside the 006d
 * group room, rendered only for the current joined organizer. It shows the
 * Members roster with the exact status labels (Organizer / Joined / Invited /
 * Declined / Left / Removed), the Recent member activity feed with its
 * designed empty state, and the single per-member action from the brief's
 * table behind a confirmation dialog.
 *
 * The one-time reinvitation link follows the 006b reveal: it lives only in
 * this component's state, is shown once, and is never persisted, logged, or
 * captured (the containing room is already data-ph-no-capture). Stale
 * compare-and-swap responses surface the pinned recovery copy and a server
 * refresh — never an automatic retry.
 */

export interface OrganizerToolsProps {
  readonly deleteAction: (
    groupId: string,
    expectedVersion: string,
  ) => Promise<DeleteGroupResult>;
  readonly presentation?: "default" | "room";
  readonly groupId: string;
  readonly groupName: string;
  readonly organizerId: string;
  readonly initialVersion: string;
  readonly members: readonly AdminRosterMember[];
  readonly liveInvitations: readonly AdminLiveInvitation[];
  readonly audit: readonly AdminAuditEntry[];
  readonly removeAction: (
    groupId: string,
    memberId: string,
    expectedVersion: string,
  ) => Promise<MemberAdminActionResult>;
  readonly transferAction: (
    groupId: string,
    memberId: string,
    expectedVersion: string,
  ) => Promise<MemberAdminActionResult>;
  readonly revokeAction: (
    groupId: string,
    invitationId: string,
    expectedVersion: string,
  ) => Promise<MemberAdminActionResult>;
  readonly reinviteAction: (
    groupId: string,
    memberId: string,
    expectedVersion: string,
  ) => Promise<ReinviteActionResult>;
}

type PendingChoice = {
  readonly action: OrganizerToolAction;
  readonly member: AdminRosterMember;
  readonly invitation: AdminLiveInvitation | undefined;
};

const ACTION_LABELS: Record<OrganizerToolAction, string> = {
  remove: "Remove from group",
  "make-organizer": "Make organizer",
  "revoke-invite": "Revoke invite",
  "invite-again": "Invite again",
};

const CONFIRM_COPY: Record<
  OrganizerToolAction,
  {
    title: (name: string) => string;
    body: (name: string) => string;
    confirm: string;
  }
> = {
  remove: {
    title: (name) => `Remove ${name} from the group?`,
    body: () =>
      "They will lose access to the group room and every member wishlist. You can invite them again later.",
    confirm: "Remove from group",
  },
  "make-organizer": {
    title: (name) => `Make ${name} the organizer?`,
    body: () =>
      "You will hand over organizer control of the member list. This can’t be undone from here.",
    confirm: "Make organizer",
  },
  "revoke-invite": {
    title: () => "Revoke this invite?",
    body: () =>
      "Their invite link will stop working. You can invite them again later.",
    confirm: "Revoke invite",
  },
  "invite-again": {
    title: (name) => `Invite ${name} again?`,
    body: () =>
      "A new one-time invite link will be created. It is shown only once.",
    confirm: "Invite again",
  },
};

export function OrganizerTools({
  presentation = "default",
  groupId,
  groupName,
  organizerId,
  initialVersion,
  members,
  liveInvitations,
  audit,
  removeAction,
  transferAction,
  revokeAction,
  reinviteAction,
  deleteAction,
}: OrganizerToolsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // The compare-and-swap cursor lives in state and follows the freshest
  // projected version: the React-documented prop-adjustment pattern (setState
  // during render, no effect, no cascading render).
  const [version, setVersion] = useState(initialVersion);
  const [projectedVersion, setProjectedVersion] = useState(initialVersion);
  if (projectedVersion !== initialVersion) {
    // A refreshed server payload always moves the cursor forward.
    setProjectedVersion(initialVersion);
    setVersion(initialVersion);
  }
  const [choice, setChoice] = useState<PendingChoice | null>(null);
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [token, setToken] = useState<{
    link: string;
    expiresAt: string;
    name: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!choice) return;
    cancel.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setChoice(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [choice]);

  function liveInvitationFor(
    member: AdminRosterMember,
  ): AdminLiveInvitation | undefined {
    return liveInvitations.find(
      (invitation) => invitation.targetUserId === member.userId,
    );
  }

  async function run(choice: PendingChoice): Promise<void> {
    setPending(true);
    try {
      const expected = version;
      let result: MemberAdminActionResult | ReinviteActionResult;
      if (choice.action === "remove") {
        result = await removeAction(groupId, choice.member.userId, expected);
      } else if (choice.action === "make-organizer") {
        result = await transferAction(groupId, choice.member.userId, expected);
      } else if (choice.action === "revoke-invite") {
        const invitation = choice.invitation;
        if (!invitation) {
          setUnavailable(true);
          return;
        }
        result = await revokeAction(groupId, invitation.invitationId, expected);
      } else {
        result = await reinviteAction(groupId, choice.member.userId, expected);
      }

      if (result.ok) {
        setVersion(result.version);
        setStale(false);
        setUnavailable(false);
        if (choice.action === "invite-again" && "token" in result) {
          setToken({
            link: targetedInviteLink(result.token, window.location.origin),
            expiresAt: result.expiresAt,
            name: choice.member.displayName,
          });
        }
        // The roster and the activity feed are server projections; the
        // committed change re-renders this page from the database only.
        router.refresh();
        return;
      }
      if (result.reason === "stale" || result.reason === "retry") {
        // Never an automatic retry: the organizer reviews the refreshed
        // list and decides again.
        setStale(true);
        router.refresh();
        return;
      }
      setUnavailable(true);
    } finally {
      setPending(false);
      setChoice(null);
    }
  }

  async function copyLink(): Promise<void> {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token.link);
      setCopyFailed(false);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <section
      className={presentation === "room" ? "contents" : "mt-10"}
      data-testid="organizer-tools"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="organizer-tools-panel"
        onClick={() => setOpen((value) => !value)}
        className={
          presentation === "room"
            ? "inline-flex cursor-pointer min-h-11 items-center gap-2 rounded-control border-2 border-outline-strong bg-surface-page px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
            : "inline-flex min-h-touch-min items-center gap-2 font-display text-heading font-bold underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong"
        }
      >
        {presentation === "room"
          ? "Organizer tools"
          : open
            ? "Hide member tools"
            : "Member tools"}
        <span aria-hidden="true">{open ? "–" : "+"}</span>
      </button>

      {open ? (
        <div
          id="organizer-tools-panel"
          data-testid="organizer-tools-panel"
          className="mt-4 w-full basis-full rounded-surface-2xl border-2 border-outline-strong bg-surface-raised p-5 shadow-chunk-sm"
        >
          {stale ? (
            <p
              role="alert"
              className="mb-4 text-caption font-bold text-content-secondary"
              data-testid="admin-stale-note"
            >
              The member list changed. Review the current list and try again.
            </p>
          ) : null}
          {unavailable ? (
            <p
              role="alert"
              className="mb-4 text-caption font-bold text-content-secondary"
              data-testid="admin-unavailable-note"
            >
              That action isn’t available right now. Review the list and try
              again.
            </p>
          ) : null}

          <h3 className="font-display text-label font-bold">Members</h3>
          <ul className="mt-3 space-y-2">
            {members.map((member) => {
              const invitation = liveInvitationFor(member);
              const actions = memberAdminActions(
                member,
                organizerId,
                invitation,
              );
              return (
                <li
                  key={member.userId}
                  data-testid="admin-member-row"
                  data-member-status={member.status}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-surface border-2 border-outline bg-surface-page px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">
                      {member.displayName}
                    </span>
                    <span className="block text-caption text-content-secondary">
                      {adminStatusLabel(member, organizerId)}
                      {member.status === "invited" && invitation
                        ? " · invite active, shown once"
                        : ""}
                    </span>
                  </span>
                  {actions.length > 0 ? (
                    <span className="flex flex-wrap gap-2">
                      {actions.map((action) => (
                        <Button
                          key={action}
                          variant="secondary"
                          onClick={() =>
                            setChoice({ action, member, invitation })
                          }
                          disabled={pending}
                          data-testid={`admin-action-${action}`}
                        >
                          {ACTION_LABELS[action]}
                        </Button>
                      ))}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {token ? (
            <div
              className="mt-5 rounded-surface-lg border-2 border-outline-strong bg-accent-highlight-soft p-4"
              data-testid="targeted-invite-card"
            >
              <p className="text-label font-bold">
                One-time invite link for {token.name}
              </p>
              <p className="mt-1.5 truncate rounded-control bg-surface-page px-3 py-3 font-semibold">
                <span className="select-all">{token.link}</span>
              </p>
              <p className="mt-2 text-caption text-content-secondary">
                Shown only once — copy it now. It expires{" "}
                {formatExpiry(token.expiresAt) ?? "at the stored expiry"}.
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
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="contrast"
                  onClick={() => {
                    void copyLink();
                  }}
                >
                  Copy invite link
                </Button>
                <a
                  href={whatsappHref(groupName, token.link)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-control-md items-center justify-center rounded-control border-2 border-outline-strong bg-surface-raised px-4 font-display text-label font-bold shadow-chunk-sm"
                >
                  Share on WhatsApp
                </a>
              </div>
            </div>
          ) : null}

          <h3 className="mt-6 font-display text-label font-bold">
            Recent member activity
          </h3>
          {audit.length === 0 ? (
            <p
              className="mt-2 text-caption text-content-secondary"
              data-testid="admin-audit-empty"
            >
              {ADMIN_AUDIT_EMPTY_TEXT}
            </p>
          ) : (
            <ul className="mt-2 space-y-1" data-testid="admin-audit-list">
              {audit.map((entry, index) => (
                <li
                  key={`${entry.createdAt}-${index}`}
                  className="text-caption text-content-secondary"
                >
                  {adminAuditText(entry)}
                </li>
              ))}
            </ul>
          )}
          <DeleteGroupControl
            groupId={groupId}
            groupName={groupName}
            version={version}
            deleteAction={deleteAction}
            disabled={pending}
          />
        </div>
      ) : null}

      {choice ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-content-primary/50 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setChoice(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-confirm-title"
            aria-describedby="admin-confirm-description"
            className="w-full max-w-md rounded-surface-2xl border-2 border-outline-strong bg-surface-raised p-6 shadow-chunk-lg"
            data-testid="admin-confirm-dialog"
          >
            <h2
              id="admin-confirm-title"
              className="font-display text-heading font-extrabold"
            >
              {CONFIRM_COPY[choice.action].title(choice.member.displayName)}
            </h2>
            <p
              id="admin-confirm-description"
              className="mt-3 text-content-secondary"
            >
              {CONFIRM_COPY[choice.action].body(choice.member.displayName)}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                ref={cancel}
                type="button"
                onClick={() => setChoice(null)}
                className="min-h-touch-min rounded-surface border-2 border-outline-strong px-4 font-bold"
              >
                Cancel
              </button>
              <Button
                onClick={() => {
                  void run(choice);
                }}
                disabled={pending}
              >
                {pending ? "Working…" : CONFIRM_COPY[choice.action].confirm}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatExpiry(iso: string): string | null {
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
