"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/src/ui/button";
import { discardProvenFlowsAction } from "./invite-actions";

/**
 * The explicit discard control on the recovery route: confirmed discard of
 * every unaccepted flow this browser can prove (coordinator + per-flow
 * browser secret). Nothing is evicted implicitly; accepted flows are never
 * discardable and a discard never touches membership.
 */
export function DiscardProvenFlowsForm() {
  return (
    <form action={discardProvenFlowsAction}>
      <DiscardButton />
    </form>
  );
}

function DiscardButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="subtle" disabled={pending}>
      {pending
        ? "Discarding…"
        : "Discard my unfinished invitations in this browser"}
    </Button>
  );
}
