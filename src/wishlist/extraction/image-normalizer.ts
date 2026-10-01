import "server-only";

import { fork } from "node:child_process";

import { guardedRequest, type TransportDependencies } from "./transport";

const IMAGE_WORKER_TIMEOUT_MS = 1_000;
const IMAGE_V8_HEAP_MB = 64;

async function normalizeInWorker(
  bytes: Uint8Array,
  contentType: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  return await new Promise((resolve) => {
    const copy = Uint8Array.from(bytes);
    const worker = fork(new URL("./image-worker.mjs", import.meta.url), [], {
      execArgv: [`--max-old-space-size=${IMAGE_V8_HEAP_MB}`],
      serialization: "advanced",
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let settled = false;
    let result: Uint8Array | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const abort = () => {
      result = null;
      worker.kill("SIGKILL");
    };
    const timer = setTimeout(abort, Math.max(0, timeoutMs));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    worker.once("message", (message: { readonly bytes: Uint8Array | null }) => {
      result = message.bytes ? Uint8Array.from(message.bytes) : null;
    });
    worker.once("error", abort);
    worker.once("exit", finish);
    if (!worker.killed) worker.send({ bytes: copy, contentType });
  });
}

/**
 * Fetches a selected candidate through the same SSRF boundary and returns one
 * static, metadata-free WebP. It never writes Storage and never acts as a
 * byte proxy; 005f owns selection and private persistence.
 */
export async function normalizeCandidateImage(
  sourceUrl: string,
  options: {
    readonly signal?: AbortSignal;
    readonly deadline?: number;
    readonly transport?: TransportDependencies;
    readonly now?: () => number;
  } = {},
): Promise<Uint8Array | null> {
  const now = options.now ?? Date.now;
  const deadline = options.deadline ?? now() + 10_000;
  try {
    const response = await guardedRequest(
      sourceUrl,
      "image",
      options.transport,
      { signal: options.signal, deadline },
    );
    const remaining = Math.min(IMAGE_WORKER_TIMEOUT_MS, deadline - now());
    if (remaining <= 0) return null;
    const output = await normalizeInWorker(
      response.body,
      response.contentType,
      remaining,
      options.signal,
    );
    return output && output.length <= 2 * 1_024 * 1_024 ? output : null;
  } catch {
    return null;
  }
}

export const IMAGE_LIMITS = {
  workerMs: IMAGE_WORKER_TIMEOUT_MS,
  v8HeapMb: IMAGE_V8_HEAP_MB,
  inputBytes: 5 * 1_024 * 1_024,
  maximumSide: 8_192,
  maximumPixels: 20_000_000,
  outputSide: 1_600,
  outputBytes: 2 * 1_024 * 1_024,
} as const;
