import { formatMoneyMinor } from "@/src/wishlist/display";

/**
 * Pure presentation contracts for the private group room (brief 006d).
 * Everything here is deterministic and testable without a DOM or a
 * database: the group-zone occasion date (the calendar day never shifts
 * through the viewer's zone), the honest calendar-day countdown, the exact
 * minor-unit budget format, the derived initials and accent, and the roster
 * summary grammar.
 */

/**
 * The projected wall clock ("YYYY-MM-DD HH:mm:ss[.ffffff]" — the stored
 * instant rendered in the group's own time zone) narrowed to its calendar
 * date. Null when the value is not a parseable wall clock.
 */
export function wallClockIsoDate(wallClock: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ]/.exec(wallClock);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const parsed = new Date(utc);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * The approved occasion line's date part — for example "Sat, 7 Nov 2026" —
 * formatted from the stored local date/time and recorded IANA time zone.
 * The projection already carries the group-zone wall clock, so the calendar
 * day is formatted in UTC (it must never shift through the viewer's zone).
 */
export function occasionDateText(wallClock: string): string | null {
  const isoDate = wallClockIsoDate(wallClock);
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Today's calendar date (YYYY-MM-DD) in the given IANA time zone — the
 * server-captured clock's zone-local date. Null for an unknown zone.
 */
export function calendarDateInZone(
  instant: Date,
  timeZone: string,
): string | null {
  try {
    const formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
    return /^\d{4}-\d{2}-\d{2}$/.test(formatted) ? formatted : null;
  } catch {
    return null;
  }
}

/**
 * The honest countdown between two calendar days in the group's zone:
 * "Today", "1 day"/"N days" before it, "1 day ago"/"N days ago" after it.
 * Both inputs are YYYY-MM-DD zone-local dates, so the difference is plain
 * calendar-day arithmetic — DST transitions cannot shift it.
 */
export function countdownText(
  todayIsoDate: string,
  occasionIsoDate: string,
): string | null {
  const today = isoDateToUtcMillis(todayIsoDate);
  const occasion = isoDateToUtcMillis(occasionIsoDate);
  if (today === null || occasion === null) return null;
  const days = Math.round((occasion - today) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  if (days > 1) return `${days} days`;
  if (days === -1) return "1 day ago";
  return `${-days} days ago`;
}

function isoDateToUtcMillis(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const millis = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isFinite(millis) ? millis : null;
}

/**
 * The exact budget from integer minor units and the stored currency, in the
 * pinned money format ("2500.00 INR"); null when the pair is absent or
 * unsupported. No approximate conversion exists in this room slice.
 */
export function roomBudgetText(
  amountMinor: string | null,
  currency: string | null,
): string | null {
  if (amountMinor === null || currency === null) return null;
  try {
    return formatMoneyMinor(amountMinor, currency);
  } catch {
    return null;
  }
}

/**
 * Presentational initials from the projected display name: the first
 * grapheme of each of the first two whitespace-separated tokens, uppercased.
 * The adjacent full display name and textual state always carry the meaning;
 * initials are never the only signal.
 */
export function initialsFor(displayName: string): string {
  const tokens = displayName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "M";
  return tokens
    .slice(0, 2)
    .map((token) => ([...token][0] ?? "").toUpperCase())
    .join("");
}

/**
 * The approved accent set, cycled deterministically by the member UUID so
 * no new profile attribute is persisted. Decorative only; the textual label
 * always carries the row's meaning.
 */
const ACCENT_CLASSES = [
  "bg-accent-fresh-soft text-accent-fresh-strong",
  "bg-accent-info-soft text-accent-info-strong",
  "bg-accent-highlight-soft text-accent-highlight-strong",
] as const;

export function accentClassFor(memberUserId: string): string {
  let hash = 0;
  for (const character of memberUserId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return ACCENT_CLASSES[hash % ACCENT_CLASSES.length];
}

/**
 * The roster summary grammar: "N joined" when there are no pending rows and
 * "N joined, M invited" when pending rows exist — counts derived from the
 * same snapshot's rows, never separate queries.
 */
export function rosterSummaryText(
  joinedCount: number,
  pendingCount: number,
): string {
  if (pendingCount === 0) {
    return `${joinedCount} joined`;
  }
  return `${joinedCount} joined, ${pendingCount} invited`;
}
