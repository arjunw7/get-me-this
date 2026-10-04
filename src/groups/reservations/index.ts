/**
 * Public surface of the 007c reservations slice.
 *
 * WIRING STATUS (fast-lane build, owner-authorized 2026-10-03):
 *
 * TODO(006e wiring): `ReserveAction` is the per-item reserve affordance for
 * the member-wishlist browsing surface
 * (`/groups/[groupId]/members/[memberId]/wishlist`). That page is built by
 * the separate 006e track and is not on this base yet: wire the affordance
 * into the 006e item card, deriving `viewerState` by zipping
 * `member_wishlist_snapshot` with `my_group_reservations` (yours) and the
 * `reserved_by_other` flag of `member_wishlist_gifting_snapshot` (other) —
 * never by row position and never exposing reserver identity. Server
 * actions must apply the authoritative `reserveGroupItem` /
 * `releaseGroupReservation` results and restore prior state on retry-class
 * outcomes.
 *
 * TODO(owner wiring): deliberately none. The owner's own `/wishlist`
 * experience gains nothing in this slice (binding zero-diff requirement,
 * brief 007c acceptance criterion 13).
 */

export { ReserveAction } from "./reserve-action";
export {
  getMyGroupReservations,
  releaseGroupReservation,
  reserveGroupItem,
} from "./reservation-write";
export { isReservationReleaseResult, isReservationWriteResult } from "./types";
export type {
  ReservationReleaseResult,
  ReservationViewerState,
  ReservationWriteResult,
} from "./types";
export type {
  OwnReservation,
  ReleaseOutcome,
  ReservationOutcome,
} from "./reservation-write";
