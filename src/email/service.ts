import "server-only";

/**
 * Server-side delivery clients for the 009a send pipeline.
 *
 * - The service-role key is a server-only secret read from the environment;
 *   it never appears in any client bundle, fixture, commit, log, or
 *   screenshot. Both accessors return null when absent so documentation-stage
 *   builds and credential-independent tests stay buildable.
 * - The Resend client uses the transactional HTTP API (004b's auth delivery
 *   stays on the existing SMTP path, untouched). Bounded provider ids are
 *   kept; response bodies are discarded — never logged.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SendOutcome } from "./worker";

export type EmailServiceConfig = {
  supabaseUrl: string;
  serviceKey: string;
  resendApiKey: string | null;
  appBaseUrl: string;
};

export function getEmailServiceConfig(): EmailServiceConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) return null;
  if (!/^https:\/\//.test(supabaseUrl)) return null;
  const appBaseUrl =
    process.env.APP_BASE_URL?.trim() ?? "http://127.0.0.1:3100";
  return {
    supabaseUrl,
    serviceKey,
    resendApiKey: process.env.RESEND_API_KEY?.trim() || null,
    appBaseUrl,
  };
}

export function createEmailServiceClient(
  config: EmailServiceConfig,
): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ResendSendResponse = { id?: unknown };

/** Sends via the Resend transactional API; response bodies are never logged. */
export async function sendWithResend(
  apiKey: string,
  from: string,
  toUserId: string,
  rendered: { subject: string; html: string; text: string },
  recipientAddress: string,
): Promise<SendOutcome> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipientAddress],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
      referrerPolicy: "no-referrer",
    });

    if (response.status === 429) {
      return { ok: false, category: "rate_limited" };
    }
    if (!response.ok) {
      return { ok: false, category: "provider_error" };
    }

    const body = (await response.json()) as ResendSendResponse;
    const id = typeof body.id === "string" ? body.id : null;
    return { ok: true, providerMessageId: id };
  } catch {
    // Network failure: bounded retry through the outbox's claim-time
    // backoff. No response body or address is logged.
    return { ok: false, category: "provider_error" };
  }
}
