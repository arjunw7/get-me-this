"use server";
import { revalidatePath } from "next/cache";
import { requireCompleteProfile } from "@/src/profile/session";
import {
  getMyGroupReservations,
  releaseGroupReservation,
  reserveGroupItem,
} from "./reservations/reservation-write";

export async function reserveGiftingItem(
  groupId: string,
  itemId: string,
): Promise<"reserved" | "conflict" | "error"> {
  await requireCompleteProfile();
  const result = await reserveGroupItem(groupId, itemId);
  if (result.kind !== "confirmed" || result.result === "unavailable")
    return "error";
  revalidatePath(`/groups/${groupId}`, "layout");
  return result.result === "conflict" ? "conflict" : "reserved";
}

export async function releaseGiftingItem(
  groupId: string,
  itemId: string,
): Promise<"released" | "error"> {
  await requireCompleteProfile();
  const own = (await getMyGroupReservations(groupId)).find(
    (row) => row.itemId === itemId,
  );
  if (!own) return "error";
  const result = await releaseGroupReservation(groupId, own.reservationId);
  if (result.kind !== "confirmed" || result.result !== "released")
    return "error";
  revalidatePath(`/groups/${groupId}`, "layout");
  return "released";
}
