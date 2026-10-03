/**
 * Render-time escaping and bounded-length helpers (009a).
 *
 * Every user-supplied string (group name, display name) reaches an HTML
 * context only through escapeHtml, and every rendered field is bounded,
 * mirroring the 005a/006a text bounds. Tokens are never passed to any
 * logging or storage path — only into the invitation link at render time.
 */

import { EMAIL_PALETTE } from "./brand-palette";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** Bounded-length check mirroring the 005a/006a text bounds. */
export function bounded(value: string, max = 200): string {
  return value.length <= max ? value : value.slice(0, max);
}

const MAX_200 = 200;

export function assertBounded(value: string, label: string): string {
  if (value.length > MAX_200) {
    throw new Error(`email_template_value_unbounded:${label}`);
  }
  return value;
}

export type BrandedEmailShellInput = {
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
};

/**
 * Shared branded layout consistent with the 004b branded auth email:
 * approved product nouns only, one dominant call to action, rendering that
 * degrades without images (no tracking pixels, no open tracking), and a
 * no-referrer link policy on the canonical raw route.
 */
export function brandedShell(input: BrandedEmailShellInput): string {
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8" />',
    '<meta name="referrer" content="no-referrer" />',
    "</head>",
    `<body style="margin:0;padding:0;background:${EMAIL_PALETTE.pageBackground};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${EMAIL_PALETTE.contentPrimary};">`,
    '<div style="max-width:560px;margin:0 auto;padding:32px 24px;">',
    `<p style="font-size:20px;font-weight:700;margin:0 0 24px;">Get Me This</p>`,
    `<h1 style="font-size:24px;margin:0 0 16px;">${escapeHtml(input.heading)}</h1>`,
    input.bodyHtml,
    `<p style="margin:32px 0;"><a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;background:${EMAIL_PALETTE.actionPrimary};color:${EMAIL_PALETTE.actionPrimaryContent};font-weight:700;padding:14px 24px;border-radius:12px;text-decoration:none;" rel="noopener">${escapeHtml(input.ctaLabel)}</a></p>`,
    `<p style="font-size:12px;color:${EMAIL_PALETTE.contentMuted};margin:24px 0 0;">Sent by Get Me This — group wishlists for every occasion.</p>`,
    "</div></body></html>",
  ].join("\n");
}
