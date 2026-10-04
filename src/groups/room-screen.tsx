import { InvitePeopleButton } from "./invite-people-button";
import { vibeClasses } from "@/src/profile/vibe";
import type { MemberVibes } from "./member-vibes-data";
import Link from "next/link";
import { FragmentTarget } from "./fragment-target";
import { giftingMoney } from "./gifting-budget";

import {
  countdownText,
  initialsFor,
  occasionDateText,
  rosterSummaryText,
  wallClockIsoDate,
} from "./room-format";
import { GIFTING_MODES } from "./occasions";

import type { GroupRoomSnapshot } from "./room-data";
import type { ActivityEntry } from "./activity-data";
import { GroupActivitySection } from "./activity-section";

export function GroupRoomScreen({
  room,
  callerId,
  today,
  activity,
  organizerTools,
  modeStatus,
  memberWishlists,
  drawControls,
  memberVibes = {},
}: {
  readonly room: GroupRoomSnapshot;
  readonly callerId: string;
  readonly today: string | null;
  readonly activity?: readonly ActivityEntry[];
  /** The 006f organizer tools, rendered only for the current organizer. */
  readonly organizerTools?: React.ReactNode;
  readonly modeStatus?: React.ReactNode;
  readonly memberWishlists?: React.ReactNode;
  readonly drawControls?: React.ReactNode;
  readonly memberVibes?: MemberVibes;
}) {
  const occasionIsoDate = wallClockIsoDate(room.occasionAt);
  const occasionDate = occasionIsoDate
    ? occasionDateText(room.occasionAt)
    : null;
  const countdown =
    today && occasionIsoDate ? countdownText(today, occasionIsoDate) : null;
  const budget = giftingMoney(room.budgetAmountMinor, room.budgetCurrency);
  const modeLabel =
    GIFTING_MODES.find((mode) => mode.value === room.mode)?.name ?? room.mode;

  const joinedRows = room.members.filter((member) => member.state === "joined");
  const pendingRows = room.members.filter(
    (member) => member.state === "invited",
  );

  return (
    <div
      className="mx-auto w-full max-w-6xl px-5 py-4 sm:px-8 lg:py-10"
      data-ph-no-capture
      data-testid="group-room"
    >
      <Link
        href="/home"
        className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold"
      >
        <span aria-hidden="true">←</span> Home
      </Link>
      <header className="relative overflow-hidden rounded-[32px] border-2 border-outline-strong bg-accent-highlight p-6 shadow-chunk sm:p-8">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-6 top-3 text-5xl opacity-50"
        >
          ✧
        </span>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="min-w-0">
            <p className="inline-flex rounded-pill border-2 border-outline-strong bg-content-primary px-3 py-1 text-caption font-bold text-surface-raised">
              {modeLabel}
            </p>
            <h1 className="mt-4 break-words font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
              {room.name}
            </h1>
            <p className="mt-3 text-[15px] font-semibold">
              {room.occasion}
              {occasionDate ? ` · ${occasionDate}` : ""}
            </p>
            {room.location ? (
              <p className="mt-1 text-[15px] font-semibold">{room.location}</p>
            ) : null}
          </div>
          <dl className="flex flex-wrap gap-8">
            {countdown ? (
              <div>
                <dt className="text-sm font-semibold">Countdown</dt>
                <dd
                  className="font-display text-4xl font-extrabold tabular-nums sm:text-5xl"
                  suppressHydrationWarning
                >
                  {countdown}
                </dd>
              </div>
            ) : null}
            {budget ? (
              <div>
                <dt className="text-sm font-semibold">Budget</dt>
                <dd className="font-display text-3xl font-extrabold tabular-nums sm:text-4xl">
                  {budget}
                  <span className="block font-sans text-sm font-semibold">
                    {" "}
                    per person
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
        {room.description ? (
          <p className="mt-5 max-w-2xl text-base">{room.description}</p>
        ) : null}
        {room.organizerId === callerId || organizerTools ? (
          <div className="mt-6 flex flex-wrap items-start gap-2">
            {room.organizerId === callerId ? (
              <InvitePeopleButton
                groupId={room.groupId}
                groupName={room.name}
              />
            ) : null}
            {organizerTools}
          </div>
        ) : null}
      </header>
      <section className="mt-10">
        <h2
          id="whos-in-heading"
          className="font-display text-heading tracking-tight"
        >
          Who&apos;s in
        </h2>
        <p className="mt-1 text-caption text-content-secondary">
          {rosterSummaryText(joinedRows.length, pendingRows.length)}
        </p>

        <p id="whos-in-region-description" className="sr-only">
          The member list scrolls horizontally when it does not fit on the
          screen.
        </p>
        <div
          role="region"
          aria-labelledby="whos-in-heading"
          aria-describedby="whos-in-region-description"
          tabIndex={0}
          data-testid="roster-region"
          className="-mx-1 mt-2 overflow-x-auto rounded-surface-lg outline-offset-4 focus-visible:outline-2 focus-visible:outline-outline-strong"
        >
          {/* Scrollports clip transformed children on both axes. Keep hover lift
              and keyboard focus rings inside the rail's padded bounds. */}
          <ul className="flex min-w-max gap-4 px-1 pb-2 pt-2">
            {room.members.map((member) => {
              const label = memberLabel(member, callerId);
              // Brief 006e entry point: a joined member's roster row opens
              // that member's shared wishlist; pending rows stay
              // non-interactive placeholders (pending visibility is
              // presentation, never authority).
              const rowContent = (
                <>
                  <span
                    aria-hidden="true"
                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 font-display text-label font-bold ${member.state === "invited" ? "border-dashed border-outline-strong/35 bg-surface-page text-content-secondary" : `border-outline-strong ${vibeClasses(memberVibes[member.userId])}`}`}
                  >
                    {initialsFor(member.displayName)}
                  </span>
                  <span className="mt-1.5 flex w-full min-w-0 flex-col text-center">
                    <span
                      className="truncate text-sm font-bold"
                      title={member.displayName}
                    >
                      {member.displayName}
                    </span>
                    <span className="text-caption text-content-secondary">
                      {label}
                    </span>
                  </span>
                </>
              );
              if (member.state === "invited") {
                return (
                  <li
                    key={member.userId}
                    className="flex w-20 shrink-0 flex-col items-center"
                    data-testid="pending-row"
                  >
                    {rowContent}
                  </li>
                );
              }
              return (
                <li
                  key={member.userId}
                  className="w-20 shrink-0"
                  data-testid="joined-row"
                >
                  <Link
                    href={`/groups/${room.groupId}/members/${member.userId}/wishlist`}
                    data-testid="roster-member-link"
                    className="flex flex-col items-center transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5 focus-visible:rounded-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                    aria-label={
                      member.userId === callerId
                        ? "Open your wishlist"
                        : `Open ${member.displayName}'s wishlist`
                    }
                  >
                    {rowContent}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {modeStatus}
      {memberWishlists ? (
        // Keep the fragment target in the room shell: wishlist rows may stream
        // later, after the browser has already looked for the URL's anchor.
        <FragmentTarget id="wishlists">{memberWishlists}</FragmentTarget>
      ) : null}
      {pendingRows.length > 0 && memberWishlists ? (
        <p className="mt-10 rounded-surface-lg border-2 border-dashed border-outline-subtle p-5 text-content-secondary">
          {pendingRows.map((member) => member.displayName).join(", ")} haven’t
          joined yet. Their wishlists show up here once they do.
        </p>
      ) : null}
      {drawControls}
      {activity ? <GroupActivitySection entries={activity} /> : null}
    </div>
  );
}

function memberLabel(
  member: { userId: string; state: "joined" | "invited"; isOrganizer: boolean },
  callerId: string,
): string {
  const isCaller = member.userId === callerId;
  if (member.state === "invited") return "Invited";
  const labels = [
    isCaller ? "You" : null,
    member.isOrganizer ? "Organizer" : null,
  ].filter((label): label is string => label !== null);
  if (labels.length > 0) return labels.join(" · ");
  return "Joined";
}
