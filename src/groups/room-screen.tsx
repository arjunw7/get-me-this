import Link from "next/link";

import {
  accentClassFor,
  countdownText,
  initialsFor,
  occasionDateText,
  rosterSummaryText,
  roomBudgetText,
  wallClockIsoDate,
} from "./room-format";
import { GIFTING_MODES } from "./occasions";

import type { GroupRoomSnapshot } from "./room-data";

/**
 * The private group room (brief 006d): the V18-informed header hierarchy
 * over the authoritative read model plus the minimal safe roster. The slice
 * deliberately ends after the roster and the optional bounded description —
 * no invite/share/organizer controls, no wishlist or gifting state, no
 * "coming soon" placeholders.
 *
 * The whole surface is marked data-ph-no-capture: it combines private group
 * content with membership mappings, so autocapture and session replay are
 * blocked for the room.
 */

export function GroupRoomScreen({
  room,
  callerId,
  today,
}: {
  readonly room: GroupRoomSnapshot;
  readonly callerId: string;
  readonly today: string | null;
}) {
  const occasionIsoDate = wallClockIsoDate(room.occasionAt);
  const occasionDate = occasionIsoDate
    ? occasionDateText(room.occasionAt)
    : null;
  const countdown =
    today && occasionIsoDate ? countdownText(today, occasionIsoDate) : null;
  const budget = roomBudgetText(room.budgetAmountMinor, room.budgetCurrency);
  const modeLabel =
    GIFTING_MODES.find((mode) => mode.value === room.mode)?.name ?? room.mode;

  const joinedRows = room.members.filter((member) => member.state === "joined");
  const pendingRows = room.members.filter(
    (member) => member.state === "invited",
  );

  return (
    <div
      className="mx-auto w-full max-w-2xl px-gutter py-10 sm:py-14"
      data-ph-no-capture
      data-testid="group-room"
    >
      <p className="inline-flex items-center rounded-pill border-2 border-outline-strong bg-accent-highlight-soft px-3 py-1 text-caption font-bold text-accent-highlight-strong">
        {modeLabel}
      </p>

      <h1 className="mt-4 font-display text-display-lg leading-[1.02] tracking-tight">
        {room.name}
      </h1>

      <p className="mt-3 text-lg text-content-secondary">
        {room.occasion}
        {occasionDate ? ` · ${occasionDate}` : ""}
      </p>

      {countdown ? (
        <p className="mt-1 text-lg font-bold" suppressHydrationWarning>
          {countdown}
        </p>
      ) : null}

      {room.location ? (
        <p className="mt-4 text-lg text-content-secondary">{room.location}</p>
      ) : null}

      {budget ? (
        <p className="mt-4 text-lg font-bold">{budget} per person</p>
      ) : null}

      {room.description ? (
        <p className="mt-6 text-lg text-content-secondary">
          {room.description}
        </p>
      ) : null}

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
          className="mt-4 overflow-x-auto rounded-surface-lg outline-offset-4 focus-visible:outline-2 focus-visible:outline-outline-strong"
        >
          <ul className="min-w-max space-y-2 pr-2">
            {room.members.map((member) => (
              <li
                key={member.userId}
                className={`flex min-w-44 items-center gap-3 rounded-surface border-2 bg-surface-raised px-4 py-3 shadow-chunk-sm ${
                  member.state === "invited"
                    ? "border-dashed border-outline"
                    : "border-outline-strong"
                }`}
                data-testid={
                  member.state === "invited" ? "pending-row" : "joined-row"
                }
              >
                <span
                  aria-hidden="true"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong font-display text-label font-bold ${accentClassFor(member.userId)}`}
                >
                  {initialsFor(member.displayName)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className="truncate font-bold"
                    title={member.displayName}
                  >
                    {member.displayName}
                  </span>
                  <span className="text-caption text-content-secondary">
                    {memberLabel(member, callerId)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mt-10 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/home"
          className="inline-flex h-control-lg min-h-11 items-center justify-center rounded-surface-lg border-2 border-outline-strong bg-action-primary px-6 font-display text-heading font-bold shadow-chunk transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          Home
        </Link>
      </div>
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
