import { vibeClasses, type Vibe } from "@/src/profile/vibe";
import type { MemberVibes } from "./member-vibes-data";
import Link from "next/link";
import { CardImage } from "@/src/wishlist/card-image";
import type { ReactNode } from "react";
import { setGiftEntryStatusAction } from "./gifting-actions";
import { initialsFor } from "./room-format";
import { giftingMoney } from "./gifting-budget";
import type { GroupRoomMember } from "./room-data";
import type { GiverAssignment } from "./assignment-data";
import type { ChecklistRow } from "./gifting";
export type { ChecklistRow } from "./gifting";

export function GiftingBackLink({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  return (
    <Link
      href={`/groups/${groupId}`}
      className="mb-2 inline-flex min-h-11 items-center gap-2 text-sm font-bold"
    >
      <span aria-hidden="true">←</span>
      {groupName}
    </Link>
  );
}

export function PrivateGiftingNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 flex gap-2 rounded-surface bg-white/15 px-4 py-3 text-sm leading-relaxed">
      <svg
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9 5.5A11 11 0 0 1 21 12a14 14 0 0 1-3 4M6.6 6.6A13 13 0 0 0 3 12s3 7 9 7a11 11 0 0 0 5.4-1.5" />
      </svg>
      {children}
    </p>
  );
}

export function GiftingScreen({
  groupId,
  groupName,
  rows,
  conflict,
  recipientContent = {},
  recipientCounts = {},
  recipientThumbnails = {},
  pendingMembers = [],
  memberVibes = {},
}: {
  groupId: string;
  groupName: string;
  rows: ChecklistRow[];
  conflict: boolean;
  recipientContent?: Record<string, ReactNode>;
  recipientCounts?: Record<string, number>;
  recipientThumbnails?: Record<
    string,
    readonly { url: string; title: string }[]
  >;
  pendingMembers?: readonly GroupRoomMember[];
  memberVibes?: MemberVibes;
}) {
  const recipients = rows.filter(
    (row) => !row.isSentinel && row.recipientUserId !== null,
  );
  const completed = recipients.filter(
    (row) => row.entryStatus === "completed",
  ).length;
  const budget = giftingMoney(
    rows[0]?.budgetAmountMinor?.toString() ?? null,
    rows[0]?.budgetCurrency ?? null,
  );
  return (
    <section aria-labelledby="gifting-heading" data-ph-no-capture>
      <GiftingBackLink groupId={groupId} groupName={groupName} />
      <header className="rounded-surface-2xl border-2 border-outline-strong bg-accent-info p-6 text-white shadow-chunk sm:p-8">
        <p className="text-caption font-bold text-white/90">
          Gift everyone · {groupName}
        </p>
        <h1
          id="gifting-heading"
          className="mt-2 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl"
        >
          Your gifting checklist
        </h1>
        <p className="mt-3 text-white/90">
          {budget ? `${budget} per person. ` : ""}Tick them off at your own
          pace.
        </p>
        <PrivateGiftingNote>
          Nobody can see what&apos;s reserved for them. Your friends can&apos;t
          see your list, and you can&apos;t see theirs.
        </PrivateGiftingNote>
      </header>
      {conflict ? (
        <p
          role="alert"
          className="mt-5 rounded-surface border-2 border-outline-strong bg-surface-raised p-4"
        >
          Someone already updated this entry — this list now shows the current
          state. Nothing was overwritten.
        </p>
      ) : null}
      <div className="my-8 flex items-center gap-4">
        <div
          role="progressbar"
          aria-label="Gifting checklist progress"
          aria-valuemin={0}
          aria-valuemax={recipients.length || 1}
          aria-valuenow={completed}
          className="h-3 flex-1 overflow-hidden rounded-pill border-2 border-outline-strong bg-surface-raised"
        >
          <div
            className="h-full bg-accent-info"
            style={{
              width: `${recipients.length ? (completed / recipients.length) * 100 : 0}%`,
            }}
          />
        </div>
        <span className="text-caption font-bold">
          {completed} of {recipients.length} sorted
        </span>
      </div>
      {recipients.length === 0 ? (
        <p
          data-testid="checklist-empty"
          className="rounded-surface-lg border-2 border-dashed border-outline bg-surface-raised p-8 text-center"
        >
          You are the only participating member right now, so there is nobody to
          gift yet.
        </p>
      ) : (
        <ul data-testid="checklist-rows" className="space-y-3">
          {recipients.map((row, index) => (
            <li key={row.recipientUserId} className="relative">
              <form
                action={setGiftEntryStatusAction}
                className="absolute left-4 top-4 z-10 translate-x-0.5 translate-y-0.5"
              >
                <input type="hidden" name="groupId" value={groupId} />
                <input
                  type="hidden"
                  name="recipientId"
                  value={row.recipientUserId!}
                />
                <input
                  type="hidden"
                  name="expectedVersion"
                  value={row.entryVersion ?? ""}
                />
                <input
                  type="hidden"
                  name="status"
                  value={row.entryStatus === "completed" ? "todo" : "completed"}
                />
                <button
                  type="submit"
                  aria-label={`${row.entryStatus === "completed" ? "Reopen" : "Mark completed"}: ${row.recipientDisplayName}`}
                  className="flex h-11 w-11 items-center justify-center"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-7 w-7 items-center justify-center rounded-control border-2 border-outline-strong ${row.entryStatus === "completed" ? "bg-accent-info text-white" : "bg-surface-raised"}`}
                  >
                    {row.entryStatus === "completed" ? "✓" : ""}
                  </span>
                </button>
              </form>
              <details
                open={index === 0}
                className="group overflow-hidden rounded-surface-lg border-2 border-outline-strong bg-surface-raised open:shadow-chunk-sm"
              >
                <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 p-4 pl-18 [&::-webkit-details-marker]:hidden">
                  <span
                    aria-hidden="true"
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong text-caption font-bold ${vibeClasses(memberVibes[row.recipientUserId!])}`}
                  >
                    {initialsFor(row.recipientDisplayName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">
                      {row.recipientDisplayName}
                    </span>
                    <span className="block text-caption text-content-secondary">
                      {row.entryStatus === "completed"
                        ? "Sorted. Nicely done."
                        : recipientCounts[row.recipientUserId!] === undefined
                          ? "Wishlist unavailable"
                          : `${recipientCounts[row.recipientUserId!]} ideas${budget ? ` · ${budget} budget` : ""}`}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="hidden -space-x-2 sm:flex"
                  >
                    {recipientThumbnails[row.recipientUserId!]?.map((image) => (
                      <span
                        key={image.url}
                        className="relative h-10 w-10 overflow-hidden rounded-control border-2 border-surface-raised"
                      >
                        <CardImage src={image.url} title={image.title} />
                      </span>
                    ))}
                  </span>
                  <span
                    aria-hidden="true"
                    className="transition-transform group-open:rotate-180"
                  >
                    ⌄
                  </span>
                </summary>
                <div className="border-t-2 border-dashed border-outline/20 p-4 sm:p-5">
                  {recipientContent[row.recipientUserId!] ?? (
                    <Link
                      href={`/groups/${groupId}/members/${row.recipientUserId}/wishlist`}
                      className="inline-flex min-h-11 items-center font-bold underline"
                    >
                      Browse wishlist
                    </Link>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      {pendingMembers.length ? (
        <ul className="mt-3 space-y-3">
          {pendingMembers.map((member) => (
            <li
              key={member.userId}
              className="flex items-center gap-3 rounded-surface-lg border-2 border-dashed border-outline/25 px-5 py-4 text-content-secondary"
            >
              <span
                aria-hidden="true"
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-outline/30 text-caption font-bold"
              >
                {initialsFor(member.displayName)}
              </span>
              <div>
                <p className="font-bold">{member.displayName}</p>
                <p className="text-caption">
                  Hasn&apos;t joined yet. Their wishlist will appear here.
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function BrowseGiftingScreen({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  return (
    <section>
      <GiftingBackLink groupId={groupId} groupName={groupName} />
      <div className="rounded-surface-2xl border-2 border-dashed border-outline/40 bg-surface-raised px-6 py-8 text-center">
        <h1 className="font-display text-display-md tracking-tight sm:text-display-lg">
          No assignments in this group.
        </h1>
        <p className="mx-auto mt-3 max-w-lg leading-relaxed text-content-secondary">
          {groupName} is sharing wishlists only. Reserve anything from any
          wishlist. Recipients never see it.
        </p>
        <a
          href={`/groups/${groupId}#wishlists`}
          className="mt-6 inline-flex min-h-12 items-center rounded-control border-2 border-outline-strong bg-accent-info px-6 font-bold text-white"
        >
          Browse wishlists
        </a>
      </div>
    </section>
  );
}

export function SecretGiftingScreen({
  groupId,
  groupName,
  assignment,
  recipientVibe,
  children,
}: {
  groupId: string;
  groupName: string;
  assignment: GiverAssignment | null;
  recipientVibe?: Vibe;
  children?: ReactNode;
}) {
  const recipient = assignment?.isValid
    ? (assignment.recipientDisplayName ?? "Member")
    : null;
  const recipientFirstName = recipient?.trim().split(/\s+/)[0] || "Member";
  return (
    <section data-ph-no-capture>
      <GiftingBackLink groupId={groupId} groupName={groupName} />
      <div className="grid items-start gap-8 xl:grid-cols-[360px_minmax(0,1fr)]">
        <header className="rounded-surface-2xl border-2 border-outline-strong bg-accent-info p-7 text-white shadow-chunk">
          <p className="text-caption font-bold text-white/90">
            Names drawn privately · {groupName}
          </p>
          <div className="mt-4 flex items-center gap-4">
            <h1
              aria-label={recipient ? `You got ${recipient}` : undefined}
              className="min-w-0 flex-1 font-display text-display-lg leading-[1.02] tracking-tight"
            >
              {recipient ? (
                <>
                  You got
                  <br />
                  {recipientFirstName}
                </>
              ) : assignment ? (
                "Your draw needs an update"
              ) : (
                "Your draw is coming"
              )}
            </h1>
            {recipient ? (
              <span
                aria-hidden="true"
                className={`flex h-24 w-24 shrink-0 -rotate-6 items-center justify-center rounded-full border-2 border-outline-strong text-3xl font-bold italic ${vibeClasses(recipientVibe)}`}
              >
                {initialsFor(recipient)}
              </span>
            ) : null}
          </div>
          {recipient ? (
            <p className="mt-5 inline-block -rotate-2 rounded-control border-2 border-outline-strong bg-surface-page px-3 py-1 font-display text-heading text-content-primary shadow-chunk-sm">
              Act surprised.
            </p>
          ) : null}
          <PrivateGiftingNote>
            {recipient
              ? `${recipient} can’t see reservations. Not yours, not anyone’s.`
              : assignment
                ? "The group roster changed. Your organizer can run a fresh draw."
                : "No assignment to show yet. Your organizer will draw names when the group is ready."}
          </PrivateGiftingNote>
        </header>
        {recipient ? (
          <div className="min-w-0">{children}</div>
        ) : (
          <Link
            href={`/groups/${groupId}`}
            className="inline-flex min-h-11 items-center font-bold underline"
          >
            Back to your group
          </Link>
        )}
      </div>
    </section>
  );
}
