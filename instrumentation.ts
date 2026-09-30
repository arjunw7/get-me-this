import { headers } from "next/headers";

import {
  getWishlistControlConfig,
  probeWishlistStage,
  recordWishlistObservation,
  type Participant,
} from "@/tests/helpers/wishlist-control-client";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Attribution = { caseId: string; participant: Participant };

async function attribution(): Promise<Attribution | null> {
  if (process.env.E2E_LOCAL_SUPABASE !== "1" || !getWishlistControlConfig())
    return null;
  try {
    const requestHeaders = await headers();
    const caseId = requestHeaders.get("x-arj28-case");
    const participant = requestHeaders.get("x-arj28-participant");
    if (!caseId && !participant) return null;
    if (
      !caseId ||
      !UUID.test(caseId) ||
      (participant !== "first" && participant !== "second")
    )
      throw new Error("Invalid local wishlist transport attribution");
    return { caseId, participant };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid local"))
      throw error;
    return null;
  }
}

function details(input: RequestInfo | URL, init?: RequestInit) {
  const raw = input instanceof Request ? input.url : String(input);
  const url = new URL(raw);
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const rest = local && url.pathname.startsWith("/rest/v1/");
  const auth = local && url.pathname.startsWith("/auth/v1/");
  const table = rest && /\/wishlist_items$/.test(url.pathname);
  const match = url.searchParams.get("id")?.match(/^eq\.([0-9a-f-]{36})$/i);
  const targetId = match && UUID.test(match[1]) ? match[1] : undefined;
  return {
    method,
    targetId,
    kind: auth
      ? ("local-auth" as const)
      : rest
        ? ("local-rest" as const)
        : local
          ? null
          : ("external-host-digest" as const),
    isItem: table && targetId !== undefined,
    origin: url.origin,
  };
}

async function probeRead(
  originalFetch: typeof fetch,
  data: ReturnType<typeof details>,
  current: Attribution,
): Promise<"owner-read-abort" | null> {
  if (!data.isItem || data.method !== "GET" || !data.targetId) return null;
  for (const stage of [
    "postgrest-reconcile-read-failure",
    "postgrest-edit-read-failure",
  ] as const) {
    const result = await probeWishlistStage({
      ...current,
      stage,
      targetId: data.targetId,
      fetchImpl: originalFetch,
    });
    if (result.decision === "released") {
      if (result.effect !== "owner-read-abort")
        throw new Error("Invalid wishlist read injection effect");
      return result.effect;
    }
    if (result.reason === "target-mismatch" || result.reason === "consumed")
      return null;
  }
  return null;
}

export function installWishlistTestFetch(
  originalFetch: typeof fetch,
  requestAttribution = attribution,
): void {
  if (
    process.env.E2E_LOCAL_SUPABASE !== "1" ||
    !process.env.E2E_WISHLIST_CONTROL_URL ||
    !process.env.E2E_WISHLIST_CONTROL_TOKEN
  )
    return;
  const controlOrigin = getWishlistControlConfig()!.url;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === controlOrigin) return originalFetch(input, init);
    const current = await requestAttribution();
    if (!current) return originalFetch(input, init);
    const data = details(input, init);
    if (!data.kind) return originalFetch(input, init);
    const targetId = data.isItem ? data.targetId : undefined;
    await recordWishlistObservation({
      ...current,
      kind: data.kind,
      phase: "attempt",
      targetId,
    });
    let injected = false;
    try {
      if (data.isItem && data.method === "DELETE" && targetId) {
        const decision = await probeWishlistStage({
          ...current,
          stage: "postgrest-delete-pre-dispatch-failure",
          targetId,
          fetchImpl: originalFetch,
        });
        if (decision.decision === "released") {
          if (decision.effect !== "delete-pre-dispatch-failure")
            throw new Error("Invalid delete injection");
          injected = true;
          throw new Error("Injected wishlist transport failure");
        }
      }
      const readInjection = await probeRead(originalFetch, data, current);
      if (readInjection) {
        if (readInjection !== "owner-read-abort")
          throw new Error("Invalid wishlist read injection");
        injected = true;
        throw new DOMException("Injected owner read failure", "AbortError");
      }
      const response = await originalFetch(input, init);
      if (data.isItem && data.method === "DELETE" && targetId) {
        await response.clone().arrayBuffer();
        const decision = await probeWishlistStage({
          ...current,
          stage: "postgrest-delete-response-loss",
          targetId,
          fetchImpl: originalFetch,
        });
        if (decision.decision === "released") {
          if (decision.effect !== "delete-response-loss")
            throw new Error("Invalid delete response-loss injection");
          injected = true;
          throw new Error("Injected wishlist transport failure after response");
        }
      }
      await recordWishlistObservation({
        ...current,
        kind: data.kind,
        phase: "settled",
        outcome: "response",
        targetId,
      });
      return response;
    } catch (error) {
      await recordWishlistObservation({
        ...current,
        kind: data.kind,
        phase: "settled",
        outcome: "network-error",
        targetId,
        injected,
      });
      throw error;
    }
  };
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (
    process.env.E2E_LOCAL_SUPABASE !== "1" ||
    !process.env.E2E_WISHLIST_CONTROL_URL ||
    !process.env.E2E_WISHLIST_CONTROL_TOKEN
  )
    return;
  const originalFetch = globalThis.fetch.bind(globalThis);
  installWishlistTestFetch(originalFetch);
}
