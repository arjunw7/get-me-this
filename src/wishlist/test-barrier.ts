import "server-only";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";

import {
  getWishlistControlConfig,
  probeWishlistStage,
  type Participant,
  type Stage,
} from "@/tests/helpers/wishlist-control-client";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function wishlistTestBarrier(stage: Stage): Promise<void> {
  if (!getWishlistControlConfig()) return;
  const requestHeaders = await headers();
  const caseId = requestHeaders.get("x-arj28-case");
  const participant = requestHeaders.get("x-arj28-participant");
  if (!caseId && !participant) return;
  if (
    !caseId ||
    !UUID.test(caseId) ||
    (participant !== "first" && participant !== "second")
  )
    throw new Error("Invalid local wishlist test attribution");
  const decision = await probeWishlistStage({
    caseId,
    stage,
    participant: participant as Participant,
    probeId: randomUUID(),
  });
  if (decision.decision === "released" && decision.effect === "continue")
    return;
  if (decision.decision === "noop") return;
  throw new Error("A non-barrier injection was used at a wishlist barrier");
}
