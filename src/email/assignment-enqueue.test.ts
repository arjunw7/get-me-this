import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { enqueueAssignmentEmails } from "./assignment-enqueue";
import type { SupabaseClient } from "@supabase/supabase-js";

// The quota tests exercise the ENABLED behavior.
beforeEach(() => {
  vi.stubEnv("ABUSE_LIMITS_ENABLED", "1");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * 009a/009b assignment-enqueue contract tests against a mocked Supabase
 * client. 008c is mid-merge: this pins the brief-frozen contract so the
 * draw-path wiring (when it lands) cannot violate the privacy invariants.
 */

const validRow = {
  groupId: "g-1",
  groupName: "Secret Santa Crew",
  occasionDate: "2026-12-20",
  drawVersion: 2,
  giverId: "u-giver",
  recipientDisplayName: "Dev",
  isValid: true,
};

function fakeClient(
  rpcResults: { increment: boolean; enqueue: string } = {
    increment: true,
    enqueue: "enqueued",
  },
) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return {
        data:
          fn === "rate_limit_increment"
            ? rpcResults.increment
            : rpcResults.enqueue,
        error: null,
      };
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("enqueueAssignmentEmails (008c contract, pre-merge pin)", () => {
  it("enqueues exactly one email per valid giver under the exact 008c identity key", async () => {
    const { client, calls } = fakeClient();
    const outcome = await enqueueAssignmentEmails(client, [validRow]);
    expect(outcome).toEqual({
      enqueued: 1,
      skippedInvalid: 0,
      quotaDeferred: 0,
    });
    const enqueueCall = calls.find((c) => c.fn === "enqueue_email");
    expect(enqueueCall?.args.p_idempotency_key).toBe(
      "assignment:g-1:2:u-giver",
    );
    expect(enqueueCall?.args.p_template_key).toBe("assignment");
    expect(enqueueCall?.args.p_recipient_user_id).toBe("u-giver");
  });

  it("never emails an is_valid = false assignment (no stale-recipient leak)", async () => {
    const { client, calls } = fakeClient();
    const outcome = await enqueueAssignmentEmails(client, [
      { ...validRow, isValid: false, recipientDisplayName: "Stale Recipient" },
    ]);
    expect(outcome).toEqual({
      enqueued: 0,
      skippedInvalid: 1,
      quotaDeferred: 0,
    });
    expect(calls.find((c) => c.fn === "enqueue_email")).toBeUndefined();
  });

  it("honours the null-recipient Member-fallback state for a VALID assignment", async () => {
    const { client, calls } = fakeClient();
    const outcome = await enqueueAssignmentEmails(client, [
      { ...validRow, recipientDisplayName: null },
    ]);
    expect(outcome.enqueued).toBe(1);
    const payload = calls.find((c) => c.fn === "enqueue_email")?.args
      .p_payload as Record<string, unknown>;
    expect(payload.recipient_display_name).toBeNull();
  });

  it("consumes the per-group enqueue budget and fails closed on exhaustion", async () => {
    const { client, calls } = fakeClient({
      increment: false,
      enqueue: "enqueued",
    });
    const outcome = await enqueueAssignmentEmails(client, [validRow]);
    expect(outcome).toEqual({
      enqueued: 0,
      skippedInvalid: 0,
      quotaDeferred: 1,
    });
    expect(calls.find((c) => c.fn === "enqueue_email")).toBeUndefined();
  });

  it("keys the budget per group so one group's storm never consumes another's", async () => {
    const { client, calls } = fakeClient();
    await enqueueAssignmentEmails(client, [
      validRow,
      { ...validRow, groupId: "g-2" },
    ]);
    const budgetKeys = calls
      .filter((c) => c.fn === "rate_limit_increment")
      .map((c) => c.args.p_limit_key);
    expect(budgetKeys).toEqual(["email_enqueue:g:g-1", "email_enqueue:g:g-2"]);
  });
});
