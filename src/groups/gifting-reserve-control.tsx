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
  secondaryAction,
}: {
  groupId: string;
  itemId: string;
  viewerState: ReservationViewerState;
  secondaryAction?: React.ReactNode;
}) {
  return (
    <ReserveAction
      viewerState={viewerState}
      onReserve={() => reserveGiftingItem(groupId, itemId)}
      onRelease={() => releaseGiftingItem(groupId, itemId)}
      presentation="gifting"
      secondaryAction={secondaryAction}
    />
  );
}
