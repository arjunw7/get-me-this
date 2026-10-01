import "server-only";

import { isProfileComplete } from "@/src/profile/profile";
import { getOwnProfile, getSessionUser } from "@/src/profile/session";

import { ExtractionError, extractionErrorResponse } from "./errors";
import { extractProductLink } from "./extractor";
import {
  extractionLimiter,
  type AdmissionResult,
  type ExtractionLimiter,
} from "./limiter";
import { validateExtractionResult, type ExtractionResult } from "./result";

const BODY_LIMIT_BYTES = 8 * 1_024;
const BODY_TIMEOUT_MS = 2_000;
const TOTAL_TIMEOUT_MS = 10_000;
const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "Content-Type": "application/json; charset=utf-8",
} as const;

type BoundaryDependencies = {
  readonly authenticate?: () => Promise<{
    readonly userId: string;
    readonly complete: boolean;
  } | null>;
  readonly trustedOrigin?: string | null;
  readonly limiter?: Pick<ExtractionLimiter, "acquire">;
  readonly extract?: (
    url: string,
    options: { readonly signal: AbortSignal; readonly deadline: number },
  ) => Promise<ExtractionResult>;
  readonly now?: () => number;
};

class RequestBodyError extends ExtractionError {}

async function authenticateRequest(): Promise<{
  readonly userId: string;
  readonly complete: boolean;
} | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const profile = await getOwnProfile(user.id);
  return {
    userId: user.id,
    complete: isProfileComplete(profile?.displayName ?? null),
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: RESPONSE_HEADERS,
  });
}

function trustedApplicationOrigin(
  configured: string | null | undefined,
): string | null {
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

async function readBoundedBody(
  request: Request,
  startedAt: number,
  now: () => number,
): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    if (
      !/^\d+$/.test(contentLength) ||
      Number(contentLength) > BODY_LIMIT_BYTES
    ) {
      throw new ExtractionError("too_large");
    }
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const milliseconds = BODY_TIMEOUT_MS - (now() - startedAt);
      if (milliseconds <= 0) throw new ExtractionError("timeout");
      const next = await new Promise<ReadableStreamReadResult<Uint8Array>>(
        (resolve, reject) => {
          const timer = setTimeout(
            () => reject(new ExtractionError("timeout")),
            milliseconds,
          );
          const abort = () => reject(new ExtractionError("timeout"));
          request.signal.addEventListener("abort", abort, { once: true });
          reader
            .read()
            .then(resolve, reject)
            .finally(() => {
              clearTimeout(timer);
              request.signal.removeEventListener("abort", abort);
            });
        },
      );
      if (next.done) break;
      length += next.value.length;
      if (length > BODY_LIMIT_BYTES) throw new ExtractionError("too_large");
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError("extraction_failed");
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function parseBody(bytes: Uint8Array): string {
  let value: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    throw new RequestBodyError("extraction_failed");
  }
  if (
    value === null ||
    Array.isArray(value) ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new RequestBodyError("extraction_failed");
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "url") {
    throw new RequestBodyError("extraction_failed");
  }
  const url = (value as { url?: unknown }).url;
  if (
    typeof url !== "string" ||
    url.length > 2_048 ||
    url.trim().length === 0
  ) {
    throw new RequestBodyError("invalid_url");
  }
  return url;
}

function deniedAdmission(
  result: Exclude<AdmissionResult, { ok: true }>,
): Response {
  return json(result.reason === "rate" ? 429 : 503, {
    error: extractionErrorResponse(new ExtractionError("unavailable")),
  });
}

async function untilAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw new ExtractionError("timeout");
  return await new Promise<T>((resolve, reject) => {
    const abort = () => reject(new ExtractionError("timeout"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

export async function handleExtractionPost(
  request: Request,
  dependencies: BoundaryDependencies = {},
): Promise<Response> {
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const deadline = startedAt + TOTAL_TIMEOUT_MS;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (request.signal.aborted) controller.abort();
  else request.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, Math.max(0, deadline - now()));
  const authenticate = dependencies.authenticate ?? authenticateRequest;
  try {
    const session = await untilAbort(authenticate(), controller.signal);
    if (!session) {
      return json(401, {
        error: {
          code: "extraction_failed",
          message: "Sign in to continue.",
        },
      });
    }
    if (!session.complete) {
      return json(403, {
        error: {
          code: "extraction_failed",
          message: "Complete your profile to continue.",
        },
      });
    }
    const expectedOrigin = trustedApplicationOrigin(
      dependencies.trustedOrigin ?? process.env.APP_ORIGIN,
    );
    const requestOrigin = request.headers.get("origin");
    if (!expectedOrigin || requestOrigin !== expectedOrigin) {
      return json(403, {
        error: {
          code: "extraction_failed",
          message: "This request is not allowed.",
        },
      });
    }
    const contentType =
      request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!/^application\/json(?:\s*;|$)/.test(contentType)) {
      return json(400, {
        error: extractionErrorResponse(
          new ExtractionError("extraction_failed"),
        ),
      });
    }

    const admission = (dependencies.limiter ?? extractionLimiter).acquire(
      session.userId,
      startedAt,
    );
    if (!admission.ok) return deniedAdmission(admission);
    try {
      const bytes = await readBoundedBody(request, startedAt, now);
      const url = parseBody(bytes);
      const result = await (dependencies.extract ?? extractProductLink)(url, {
        signal: controller.signal,
        deadline,
      });
      if (controller.signal.aborted || now() > deadline) {
        throw new ExtractionError("timeout");
      }
      return json(200, { result: validateExtractionResult(result) });
    } finally {
      admission.permit.release();
    }
  } catch (error) {
    const safe = extractionErrorResponse(error);
    const status =
      error instanceof RequestBodyError
        ? 400
        : safe.code === "timeout"
          ? 504
          : safe.code === "too_large"
            ? 413
            : 422;
    return json(status, { error: safe });
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
  }
}

export const REQUEST_LIMITS = {
  bodyBytes: BODY_LIMIT_BYTES,
  bodyMs: BODY_TIMEOUT_MS,
  totalMs: TOTAL_TIMEOUT_MS,
} as const;
