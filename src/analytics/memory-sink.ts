/**
 * Bounded, deterministic in-memory analytics sink.
 *
 * This sink is NOT a default adapter: the unconfigured server lane is a true
 * no-op. The memory sink exists only for explicit test/local injection, so
 * tests can observe exactly what crossed the typed boundary without any
 * network request. It is bounded (a fixed FIFO capacity) and deterministic
 * (timestamps come from an injected clock).
 */
import type { AnalyticsEventName } from "./event-definitions";
import type { ServerCaptureContext } from "./types";

export interface MemorySinkEntry {
  readonly event: AnalyticsEventName;
  readonly properties: unknown;
  readonly context: ServerCaptureContext;
  readonly recordedAt: number;
}

export interface MemoryAnalyticsSink {
  capture(
    event: AnalyticsEventName,
    properties: unknown,
    context: ServerCaptureContext,
  ): Promise<{ ok: true; delivered: false }>;
  readEvents(): readonly MemorySinkEntry[];
  clear(): void;
}

export interface MemorySinkOptions {
  /** Maximum retained entries; the oldest entry is dropped first. */
  readonly maxEntries?: number;
  /** Injected clock so recorded timestamps are deterministic. */
  readonly clock?: () => number;
}

const DEFAULT_MAX_ENTRIES = 100;

export function createMemoryAnalyticsSink(
  options: MemorySinkOptions = {},
): MemoryAnalyticsSink {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const clock = options.clock ?? (() => 0);
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error("maxEntries must be a positive integer");
  }

  let entries: MemorySinkEntry[] = [];

  return {
    async capture(event, properties, context) {
      const entry: MemorySinkEntry = {
        event,
        properties,
        context,
        recordedAt: clock(),
      };
      entries.push(entry);
      if (entries.length > maxEntries) {
        entries = entries.slice(entries.length - maxEntries);
      }
      return { ok: true, delivered: false };
    },
    readEvents() {
      return entries.slice();
    },
    clear() {
      entries = [];
    },
  };
}
