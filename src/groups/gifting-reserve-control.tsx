"use client";
import { ReserveAction } from "./reservations/reserve-action";
import type { ReservationViewerState } from "./reservations/types";
import {
  releaseGiftingItem,
  reserveGiftingItem,
} from "./gifting-reservation-actions";

export function GiftingReserveControl({
  groupId,
  itemId,
  viewerState,
}: {
  groupId: string;
  itemId: string;
  viewerState: ReservationViewerState;
}) {
  return (
    <ReserveAction
      viewerState={viewerState}
      onReserve={() => reserveGiftingItem(groupId, itemId)}
      onRelease={() => releaseGiftingItem(groupId, itemId)}
      presentation="gifting"
    />
  );
}
