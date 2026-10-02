"use client";

import { useActionState } from "react";

import { brokerReferenceRedirectAction } from "./broker-reference-actions";
import { brokeredServerAction } from "./mutation-broker";

/**
 * The no-provider broker-mechanics fixture (test-support only): exercises
 * `brokeredServerAction` against a redirecting server action. A correct
 * run ends on this page with `?done=1` after the broker lock released.
 */
type FixtureState = { status: "idle" } | { status: "no-redirect" };

export function InviteBrokerReferenceFixture() {
  const brokered = brokeredServerAction<FixtureState>(async () => {
    // The server action always redirects; the redirect rejection must
    // resolve through the broker as an explicit navigation outcome.
    await brokerReferenceRedirectAction();
    return { status: "no-redirect" };
  });
  const [state, formAction, pending] = useActionState(brokered, {
    status: "idle",
  } as FixtureState);
  return (
    <main
      data-no-provider-config="true"
      className="mx-auto max-w-xl space-y-6 p-8"
    >
      <h1>Broker reference fixture</h1>
      <p data-testid="broker-fixture-state">{JSON.stringify(state)}</p>
      <form action={formAction}>
        <button type="submit" disabled={pending} name="run" value="redirect">
          Run the redirecting brokered action
        </button>
      </form>
    </main>
  );
}
