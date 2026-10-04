import { vibeClasses } from "@/src/profile/vibe";
import Link from "next/link";
import { giftingMoney } from "@/src/groups/gifting-budget";
import { GIFTING_MODES } from "@/src/groups/occasions";
import type { HomeDashboard } from "./dashboard-data";
import type { OwnWishlistView } from "@/src/wishlist/display";
import {
  calendarDateInZone,
  countdownText,
  initialsFor,
  occasionDateText,
  wallClockIsoDate,
} from "@/src/groups/room-format";
import {
  activityEntryIcon,
  activityEntryKey,
  activityEntryText,
} from "@/src/groups/activity-view";

const button =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-outline-strong bg-surface-raised px-5 font-bold hover:bg-surface-sunken";

function HomeGifting({ data }: { data: HomeDashboard }) {
  const { room, assignment, checklist } = data;
  if (room.mode === "wishlist_only")
    return (
      <section className="rounded-[28px] border-2 border-dashed border-outline-strong/40 bg-surface-raised p-6">
        <h2 className="font-display text-2xl font-extrabold">
          No assignments this time.
        </h2>
        <p className="mt-2 text-content-secondary">
          {room.name} is sharing wishlists only. Reserve anything you like,
          whenever you like.
        </p>
        <Link
          href={`/groups/${room.groupId}`}
          className="mt-4 inline-flex min-h-11 items-center gap-2 font-bold"
        >
          Browse wishlists <span aria-hidden="true">→</span>
        </Link>
      </section>
    );
  const recipients = checklist?.filter((row) => !row.isSentinel) ?? [];
  const sorted = recipients.filter(
    (row) => row.entryStatus === "completed",
  ).length;
  const valid = assignment?.isValid && assignment.recipientId;
  const firstName =
    assignment?.recipientDisplayName?.split(/\s+/)[0] ?? "your person";
  const title =
    room.mode === "secret_draw"
      ? valid
        ? `You got ${firstName}.`
        : assignment
          ? "Your assignment changed."
          : "The surprise is coming."
      : checklist
        ? `${recipients.length} ${recipients.length === 1 ? "person" : "people"} to spoil.`
        : "Your private gifting.";
  const subtitle =
    room.mode === "secret_draw"
      ? valid
        ? "Act surprised."
        : "Check your group for the next draw."
      : checklist
        ? `${sorted} sorted, ${recipients.length - sorted} to go.`
        : "Your checklist is unavailable right now.";
  return (
    <section
      aria-label="Your private gifting assignment"
      className="overflow-hidden rounded-[28px] border-2 border-outline-strong bg-content-primary p-6 text-surface-page shadow-chunk sm:p-7"
    >
      <p className="flex items-center gap-1.5 text-sm font-semibold text-surface-page/75">
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V6a4 4 0 0 1 8 0v4" />
        </svg>
        Only you can see this
      </p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-4xl leading-[0.95] font-extrabold sm:text-5xl">
            {title}
          </h2>
          <p className="mt-1 font-display text-2xl font-bold text-action-primary sm:text-3xl">
            {subtitle}
          </p>
        </div>
        {valid && room.mode === "secret_draw" && (
          <span
            aria-hidden="true"
            className={`flex h-16 w-16 shrink-0 -rotate-6 items-center justify-center rounded-full border-2 border-surface-page font-display text-xl font-bold ${vibeClasses(data.memberVibes[assignment.recipientId!])}`}
          >
            {initialsFor(assignment.recipientDisplayName ?? "Member")}
          </span>
        )}
      </div>
      <Link
        href={`/groups/${room.groupId}/gifting`}
        className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl border-2 border-surface-page bg-action-primary px-5 font-bold text-content-primary"
      >
        {room.mode === "secret_draw"
          ? valid
            ? `See ${firstName}’s wishlist`
            : "View gifting"
          : "Open my checklist"}
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

export function ActiveHome({
  data,
  wishlist,
  now,
  groupCount,
}: {
  data: HomeDashboard;
  wishlist: OwnWishlistView | null;
  now: Date;
  groupCount: number;
}) {
  const { room, activity } = data;
  const today = calendarDateInZone(now, room.timeZone);
  const occasion = wallClockIsoDate(room.occasionAt);
  const countdown = today && occasion ? countdownText(today, occasion) : null;
  const days = countdown?.match(/^(\d+) days?$/)?.[1];
  const budget = giftingMoney(room.budgetAmountMinor, room.budgetCurrency);
  const pending = room.members.filter(
    (member) => member.state === "invited",
  ).length;
  const emptyWishlist = wishlist?.items.length === 0;
  return (
    <div
      data-ph-no-capture
      className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:gap-8"
    >
      <div className="flex min-w-0 flex-col gap-6">
        <section
          aria-labelledby="upcoming-title"
          className="rounded-[28px] border-2 border-outline-strong bg-surface-raised p-6 shadow-chunk sm:p-7"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-content-muted">
                {occasion && today && occasion < today
                  ? "Your latest occasion"
                  : "Up next"}
              </p>
              <h2
                id="upcoming-title"
                className="mt-0.5 font-display text-3xl font-extrabold tracking-tight"
              >
                {room.name}
              </h2>
            </div>
            <span className="rounded-full border-2 border-outline-strong bg-content-primary px-3 py-1 text-xs font-bold text-surface-page">
              {GIFTING_MODES.find((mode) => mode.value === room.mode)?.name}
            </span>
          </div>
          <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
            {countdown && (
              <p className="leading-none">
                <span
                  className={`font-display font-extrabold tabular-nums text-action-primary-strong ${days ? "text-7xl" : "text-4xl"}`}
                >
                  {days ?? countdown}
                </span>
                {days && (
                  <span className="ml-2 font-display text-2xl font-bold">
                    {days === "1" ? "day to go" : "days to go"}
                  </span>
                )}
              </p>
            )}
            <dl className="grid gap-1.5 text-sm">
              <div className="flex items-center gap-2">
                <DetailIcon kind="date" />
                <dt className="sr-only">Date</dt>
                <dd className="font-semibold">
                  {occasionDateText(room.occasionAt)}
                </dd>
              </div>
              {room.location && (
                <div className="flex items-center gap-2">
                  <DetailIcon kind="location" />
                  <dt className="sr-only">Where</dt>
                  <dd>{room.location}</dd>
                </div>
              )}
              {budget && (
                <div className="flex items-center gap-2">
                  <DetailIcon kind="budget" />
                  <dt className="sr-only">Budget</dt>
                  <dd>{budget} per person</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t-2 border-dashed border-outline-strong/15 pt-5">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2" aria-hidden="true">
                {room.members.slice(0, 5).map((member) => (
                  <span
                    key={member.userId}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-outline-strong text-xs font-bold ${member.state === "invited" ? "border-dashed bg-surface-page text-content-secondary" : vibeClasses(data.memberVibes[member.userId])}`}
                  >
                    {initialsFor(member.displayName)}
                  </span>
                ))}
              </div>
              <span className="text-sm text-content-secondary">
                {room.joinedMemberCount} in
                {pending > 0 ? `, ${pending} invited` : ""}
              </span>
            </div>
            <Link
              href={`/groups/${room.groupId}`}
              data-testid="my-group-card"
              className={button}
            >
              Open group <span aria-hidden="true">→</span>
            </Link>
          </div>
          {groupCount > 1 && (
            <Link
              href="/groups"
              className="mt-4 inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4"
            >
              View all {groupCount} groups
            </Link>
          )}
        </section>
        <HomeGifting data={data} />
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <section aria-labelledby="activity-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="activity-title"
              className="font-display text-xl font-extrabold"
            >
              Since you last looked
            </h2>
            <Link
              href={`/groups/${room.groupId}`}
              className="shrink-0 text-sm font-bold"
            >
              See group
            </Link>
          </div>
          <ul className="mt-3 divide-y-2 divide-dashed divide-outline-strong/10 rounded-[24px] border-2 border-outline-strong bg-surface-raised px-4">
            {activity.length ? (
              activity.slice(0, 5).map((entry, index) => (
                <li
                  key={activityEntryKey(entry, index)}
                  className="flex items-start gap-3 py-3.5"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong bg-accent-highlight-soft"
                  >
                    {activityEntryIcon(entry)}
                  </span>
                  <p className="flex-1 text-[15px] leading-snug">
                    {activityEntryText(entry)}
                  </p>
                  <time
                    dateTime={entry.occurredAt}
                    className="shrink-0 text-xs font-semibold text-content-muted"
                  >
                    {new Intl.DateTimeFormat("en-IN", {
                      day: "numeric",
                      month: "short",
                      timeZone: room.timeZone,
                    }).format(new Date(entry.occurredAt))}
                  </time>
                </li>
              ))
            ) : (
              <li className="py-5 text-sm text-content-secondary">
                You’re all caught up. Group activity will appear here.
              </li>
            )}
          </ul>
        </section>
        <section
          aria-labelledby="refresh-title"
          className="rounded-[24px] border-2 border-dashed border-outline-strong/40 bg-surface-sunken p-5"
        >
          <h2
            id="refresh-title"
            className="font-display text-xl leading-tight font-extrabold"
          >
            {emptyWishlist
              ? "Your wishlist is empty. Your friends are guessing."
              : "Still into all of this?"}
          </h2>
          <p className="mt-1.5 text-[15px] text-content-secondary">
            {emptyWishlist
              ? `Add a few things before ${room.name} so friends know what you’d love.`
              : `Tastes move fast. Give your wishlist a quick refresh before ${room.name}.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/wishlist/items/new"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-outline-strong bg-action-primary px-4 text-sm font-bold"
            >
              + Add an item
            </Link>
            <Link
              href="/wishlist"
              data-testid="home-wishlist-link"
              className="inline-flex min-h-11 items-center rounded-xl border-2 border-outline-strong bg-surface-raised px-4 text-sm font-bold"
            >
              Update my wishlist
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function DetailIcon({ kind }: { kind: "date" | "location" | "budget" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0 text-content-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === "date" ? (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4m10-4v4M3 11h18" />
        </>
      ) : kind === "location" ? (
        <>
          <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
          <circle cx="12" cy="10" r="2" />
        </>
      ) : (
        <>
          <path d="M20 8H5a2 2 0 0 1 0-4h13v4M3 6v13a2 2 0 0 0 2 2h15V8" />
          <path d="M20 12h-5v5h5" />
        </>
      )}
    </svg>
  );
}
