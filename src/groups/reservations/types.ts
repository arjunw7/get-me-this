/**
 * Reservation vocabulary and viewer state types (brief 007c).
 *
 * The database function results are the closed vocabulary below. What a
 * viewer may observe is strictly narrower than what the database knows:
 * an item is reserved-by-you, reserved-by-another, or unreserved — never
 * who reserved it, how many reservations exist, or when.
 */

export type ReservationWriteResult =
  | "reserved"
  | "already_yours"
  | "conflict"
  | "unavailable";

export type ReservationReleaseResult = "released" | "unavailable";

export type ReservationViewerState = "unreserved" | "yours" | "other";

export function isReservationWriteResult(
  value: unknown,
): value is ReservationWriteResult {
  return (
    typeof value === "string" &&
    ["reserved", "already_yours", "conflict", "unavailable"].includes(value)
  );
}

export function isReservationReleaseResult(
  value: unknown,
): value is ReservationReleaseResult {
  return (
    typeof value === "string" && ["released", "unavailable"].includes(value)
  );
}
