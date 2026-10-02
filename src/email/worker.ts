import "server-only";

/**
 * The 009a send worker: a bounded server-side batch runner on Railway (never
 * a client path). Each run claims a finite batch through
 * private.claim_due_emails (the durable claim-time lease and attempt
 * accounting live in the database), renders the template, sends through the
 * Resend transactional API (004b's auth delivery stays on the untouched SMTP
 * path), and records the result.
 *
 * Every dependency is injected so the unit tests run against a stubbed
 * Resend client and a stubbed claim/record pair, keeping the automated
 * suites credential-independent (the staging Resend credential has been
 * broken since 2026-09-29 — live delivery stays an owner-gated item).
 *
 * The failure categories are the bounded set from the outbox; provider
 * response bodies are NEVER logged — only the coarse category.
 */

import { logEmailEvent } from "./log";
import {
  renderAssignmentEmail,
  renderInvitationEmail,
  renderReminderEmail,
} from "./templates";
import type {
  AssignmentEmailPayload,
  EmailTemplateKey,
  InvitationEmailPayload,
  ReminderEmailPayload,
  RenderedEmail,
} from "./types";

export type EmailErrorCategory =
  | "provider_error"
  | "rate_limited"
  | "invalid_payload"
  | "recipient_unavailable";

export type ClaimedEmail = {
  id: string;
  template_key: EmailTemplateKey;
  recipient_user_id: string;
  payload: Record<string, string | null>;
};

export type SendOutcome =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; category: EmailErrorCategory };

export type ClaimEmails = (limit: number) => Promise<ClaimedEmail[]>;
export type SendEmail = (
  toUserId: string,
  rendered: RenderedEmail,
) => Promise<SendOutcome>;
export type RecordEmailResult = (
  id: string,
  outcome: "sent" | "retry" | "failed_permanent",
  providerMessageId: string | null,
  errorCategory: EmailErrorCategory | null,
) => Promise<void>;

export type EmailWorkerDeps = {
  claim: ClaimEmails;
  send: SendEmail;
  record: RecordEmailResult;
  /** The deployment's public base URL used to build canonical links. */
  appBaseUrl: string;
  /**
   * 008d's assignment view route, when merged; the group-room fallback
   * otherwise. Never carries assignment data in the URL.
   */
  assignmentPath: string | null;
  /**
   * 009b's Resend budget guard ceiling: the worker fails closed with the
   * rate_limited category once the per-run send ceiling is exhausted,
   * rather than burning the monthly quota against an enqueue storm.
   */
  maxSendsPerRun: number;
  /** Raw invitation tokens by invitation reference, resolved at send time. */
  invitationTokens: (invitationId: string) => Promise<string | null>;
};

/** Provider response data is never logged; only its coarse category. */
export async function runEmailWorkerBatch(deps: EmailWorkerDeps): Promise<{
  claimed: number;
  sent: number;
  failed: number;
  deferred: number;
}> {
  const claimed = await deps.claim(25);
  let sent = 0;
  let failed = 0;
  let deferred = 0;

  for (const row of claimed) {
    if (sent >= deps.maxSendsPerRun) {
      // Budget guard fails closed: leave the row claimed; its lease expiry
      // makes it re-claimable on a later run, and the category is logged
      // with identifiers only.
      logEmailEvent("warn", "email_worker_quota_guard", {
        outbox_id: row.id,
        template_key: row.template_key,
      });
      deferred += 1;
      continue;
    }

    let rendered: RenderedEmail;
    try {
      rendered = await renderClaimedEmail(row, deps);
    } catch {
      await deps.record(row.id, "failed_permanent", null, "invalid_payload");
      logEmailEvent("error", "email_worker_invalid_payload", {
        outbox_id: row.id,
        template_key: row.template_key,
        error_category: "invalid_payload",
      });
      failed += 1;
      continue;
    }

    const outcome = await deps.send(row.recipient_user_id, rendered);
    if (outcome.ok) {
      await deps.record(row.id, "sent", outcome.providerMessageId, null);
      logEmailEvent("info", "email_worker_sent", {
        outbox_id: row.id,
        template_key: row.template_key,
        recipient_user_id: row.recipient_user_id,
        provider_message_id: outcome.providerMessageId ?? undefined,
      });
      sent += 1;
    } else if (
      outcome.category === "invalid_payload" ||
      outcome.category === "recipient_unavailable"
    ) {
      await deps.record(row.id, "failed_permanent", null, outcome.category);
      logEmailEvent("error", "email_worker_failed_permanent", {
        outbox_id: row.id,
        template_key: row.template_key,
        recipient_user_id: row.recipient_user_id,
        error_category: outcome.category,
      });
      failed += 1;
    } else {
      await deps.record(row.id, "retry", null, outcome.category);
      logEmailEvent("warn", "email_worker_retry", {
        outbox_id: row.id,
        template_key: row.template_key,
        recipient_user_id: row.recipient_user_id,
        error_category: outcome.category,
      });
      deferred += 1;
    }
  }

  return { claimed: claimed.length, sent, failed, deferred };
}

async function renderClaimedEmail(
  row: ClaimedEmail,
  deps: EmailWorkerDeps,
): Promise<RenderedEmail> {
  if (row.template_key === "invitation") {
    // Token hygiene: the raw token exists in the message body for the
    // recipient and nowhere else — never in the outbox row, logs, or errors.
    const rawToken = await deps.invitationTokens(
      typeof row.payload.invitation_id === "string"
        ? row.payload.invitation_id
        : "",
    );
    if (!rawToken) {
      throw new Error("invitation_token_unavailable");
    }
    return renderInvitationEmail(
      row.payload as unknown as InvitationEmailPayload,
      rawToken,
      deps.appBaseUrl,
    );
  }
  if (row.template_key === "assignment") {
    return renderAssignmentEmail(
      row.payload as unknown as AssignmentEmailPayload,
      deps.appBaseUrl,
      deps.assignmentPath,
    );
  }
  return renderReminderEmail(
    row.payload as unknown as ReminderEmailPayload,
    deps.appBaseUrl,
  );
}

export { logEmailEvent };
