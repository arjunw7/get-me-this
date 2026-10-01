import "server-only";

import { getServerAnalytics } from "@/src/analytics/server";
import { getSessionUser } from "@/src/profile/session";

import { handleExtractionPost } from "./request-boundary";

/**
 * The 005f-owned server instrumentation wrapper around the 005e extract
 * route (binding emission placement): `product_extraction_completed` is
 * emitted HERE — never inside `handleExtractionPost` — so the 005e
 * boundary keeps its pinned responses, admission behavior, and no-log
 * rules untouched.
 *
 * Emission discipline:
 * - Admission denials (HTTP 429/503) emit NOTHING at all.
 * - The emitted properties are the closed enums only: `outcome`
 *   (`succeeded` | `partial` | `failed`), `duration_bucket`, and
 *   `manual_fallback_offered`. No URL, host, reason code, header, or
 *   content enters any property.
 * - A failed identity read emits nothing; a telemetry failure never
 *   changes the response.
 * - Server-side duration is measured around the handler call.
 */

export type ExtractionOutcome = "succeeded" | "partial" | "failed";
export type ExtractionDurationBucket =
  "under_2s" | "2_to_5s" | "5_to_10s" | "over_10s";

export function extractionDurationBucket(
  milliseconds: number,
): ExtractionDurationBucket {
  if (milliseconds < 2_000) return "under_2s";
  if (milliseconds < 5_000) return "2_to_5s";
  if (milliseconds < 10_000) return "5_to_10s";
  return "over_10s";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Classifies a non-denied extract response body into the closed outcome
 * enum. A complete result (every optional field present and at least one
 * candidate) is `succeeded`; a result missing any of them is `partial`;
 * any failure envelope is `failed`. Never reads content beyond presence
 * and shape.
 */
export function classifyExtractionOutcome(
  status: number,
  bodyText: string,
): ExtractionOutcome {
  if (status !== 200) return "failed";
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return "failed";
  }
  if (!isRecord(body) || !isRecord(body.result)) return "failed";
  const result = body.result;
  const complete =
    typeof result.sourceUrl === "string" &&
    typeof result.title === "string" &&
    typeof result.retailer === "string" &&
    typeof result.originalAmountMinor === "string" &&
    typeof result.originalCurrency === "string" &&
    Array.isArray(result.candidateImageUrls) &&
    result.candidateImageUrls.length > 0;
  return complete ? "succeeded" : "partial";
}

export async function handleExtractionPostWithAnalytics(
  request: Request,
): Promise<Response> {
  const startedAt = Date.now();
  const response = await handleExtractionPost(request);
  const elapsed = Date.now() - startedAt;

  // Admission denials emit nothing (zero-emission denial discipline).
  if (response.status === 429 || response.status === 503) return response;

  let bodyText: string | null = null;
  try {
    bodyText = await response.text();
  } catch {
    // The response body could not be buffered; return it untouched and
    // emit nothing rather than disturb the pinned response.
    return response;
  }

  try {
    const outcome = classifyExtractionOutcome(response.status, bodyText);
    const user = await getSessionUser();
    if (user) {
      await getServerAnalytics().capture(
        "product_extraction_completed",
        {
          outcome,
          duration_bucket: extractionDurationBucket(elapsed),
          manual_fallback_offered: outcome !== "succeeded",
        },
        { distinctId: user.id },
      );
    }
  } catch {
    // Telemetry must never break the route or change the response.
  }

  return new Response(bodyText, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
