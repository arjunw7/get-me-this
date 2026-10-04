"use server";

import { redirect } from "next/navigation";

/**
 * The no-provider broker-mechanics fixture action (test-support only): a
 * server action that always redirects, used to pin how a manually wrapped
 * server action's redirect behaves in the browser broker.
 */
export async function brokerReferenceRedirectAction(): Promise<void> {
  redirect("/test-support/invite-mutation-broker-reference?done=1");
}
