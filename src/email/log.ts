import "server-only";

/**
 * Structured server logging for the 009a send pipeline (maintainer-facing
 * observability). Log lines carry identifiers and coarse categories ONLY:
 * outbox id, template key, recipient user id, provider message id, and the
 * bounded error category. No line ever contains a recipient address, raw
 * token, secret URL, email subject, or provider response body — the
 * automated hygiene tests scan for exactly those.
 */

export type EmailLogFields = {
  outbox_id?: string;
  template_key?: string;
  recipient_user_id?: string;
  provider_message_id?: string;
  error_category?: string;
  attempt_count?: number;
  route?: string;
};

const ALLOWED_FIELD_NAMES: readonly string[] = Object.keys({
  outbox_id: 0,
  template_key: 0,
  recipient_user_id: 0,
  provider_message_id: 0,
  error_category: 0,
  attempt_count: 0,
  route: 0,
});

/** Emits one structured JSON line with only the allowlisted identifier fields. */
export function logEmailEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: EmailLogFields,
): void {
  const entries: Array<[string, string | number]> = [["event", event]];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (!ALLOWED_FIELD_NAMES.includes(key)) continue;
    entries.push([key, value]);
  }
  const line = JSON.stringify(Object.fromEntries(entries));
  if (level === "info") console.log(line);
  else if (level === "warn") console.warn(line);
  else console.error(line);
}
