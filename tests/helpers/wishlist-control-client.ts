export type Stage =
  | "after-live-key-before-insert"
  | "after-unique-conflict-before-lookup"
  | "after-max-before-insert"
  | "after-edit-read-before-update"
  | "postgrest-delete-response-loss"
  | "postgrest-delete-pre-dispatch-failure"
  | "postgrest-reconcile-read-failure"
  | "postgrest-edit-read-failure";
export type Participant = "first" | "second";
export type ProbeDecision =
  | { decision: "noop"; reason: "unarmed" | "target-mismatch" | "consumed" }
  | {
      decision: "released";
      effect:
        | "continue"
        | "delete-response-loss"
        | "delete-pre-dispatch-failure"
        | "owner-read-abort";
    };
export type TestEvent = {
  probes: Array<{
    stage: Stage;
    participant: Participant;
    probeId: string;
    targetId: string | null;
    decision: "noop" | "claimed";
    reason?: "unarmed" | "target-mismatch" | "consumed";
  }>;
  arrivals: Array<{
    stage: Stage;
    participant: Participant;
    probeId: string;
    targetId: string | null;
  }>;
  observations: Array<{
    participant: Participant;
    kind: "local-auth" | "local-rest" | "external-host-digest";
    phase: "attempt" | "settled";
    outcome: "response" | "network-error" | null;
    targetId: string | null;
    injected: boolean;
  }>;
  failed: boolean;
};

const timeoutMs = 15_000;
const loopbackUrl = (raw: string): string => {
  const url = new URL(raw);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    throw new Error("Wishlist test control must use loopback HTTP");
  return url.origin;
};

export function getWishlistControlConfig(): {
  url: string;
  token: string;
} | null {
  if (process.env.E2E_LOCAL_SUPABASE !== "1") return null;
  const raw = process.env.E2E_WISHLIST_CONTROL_URL;
  const token = process.env.E2E_WISHLIST_CONTROL_TOKEN;
  if (!raw || !token)
    throw new Error("Wishlist test control configuration is incomplete");
  return { url: loopbackUrl(raw), token };
}

export async function controlRequest<T>(
  path: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const config = getWishlistControlConfig();
  if (!config) throw new Error("Wishlist test control is disabled");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(new URL(path, config.url), {
      method: body ? "POST" : "GET",
      headers: {
        "x-arj28-control-token": config.token,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Wishlist test control rejected ${path}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export const wishlistControl = {
  register(caseId: string) {
    return controlRequest<{ registered: true }>("/case", { caseId });
  },
  arm(
    caseId: string,
    stage: Stage,
    arrivals: 1 | 2,
    targetId?: string,
    oneShot = false,
  ) {
    return controlRequest<{ armed: true }>("/arm", {
      caseId,
      stage,
      arrivals,
      ...(targetId ? { targetId } : {}),
      ...(oneShot ? { oneShot: true } : {}),
    });
  },
  wait(caseId: string, stage: Stage) {
    const query = new URLSearchParams({ caseId, stage });
    return controlRequest<{ ready: true }>(`/wait?${query}`);
  },
  release(caseId: string, stage: Stage) {
    return controlRequest<{ released: number }>("/release", { caseId, stage });
  },
  releaseOne(caseId: string, stage: Stage, participant: Participant) {
    return controlRequest<{ released: number }>("/release", {
      caseId,
      stage,
      participant,
    });
  },
  events(caseId: string) {
    return controlRequest<TestEvent>(
      `/events?caseId=${encodeURIComponent(caseId)}`,
    );
  },
  clear(caseId: string) {
    return controlRequest<{ cleared: true }>("/clear", { caseId });
  },
};

export async function probeWishlistStage(args: {
  caseId: string;
  stage: Stage;
  participant: Participant;
  probeId?: string;
  targetId?: string;
  fetchImpl?: typeof fetch;
}): Promise<ProbeDecision> {
  const config = getWishlistControlConfig();
  if (!config) return { decision: "noop", reason: "unarmed" };
  const probeId = args.probeId ?? globalThis.crypto.randomUUID();
  const response = await (args.fetchImpl ?? fetch)(
    new URL("/arrive", config.url),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-arj28-control-token": config.token,
      },
      body: JSON.stringify({ ...args, probeId, fetchImpl: undefined }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  if (!response.ok) throw new Error("Wishlist test stage control failed");
  const decision = (await response.json()) as ProbeDecision;
  if (decision.decision === "noop") {
    if (!["unarmed", "target-mismatch", "consumed"].includes(decision.reason))
      throw new Error("Wishlist test stage returned an invalid no-op");
    return decision;
  }
  if (
    decision.decision !== "released" ||
    ![
      "continue",
      "delete-response-loss",
      "delete-pre-dispatch-failure",
      "owner-read-abort",
    ].includes(decision.effect)
  )
    throw new Error("Wishlist test stage returned an invalid release");
  return decision;
}

export async function recordWishlistObservation(args: {
  caseId: string;
  participant: Participant;
  kind: "local-auth" | "local-rest" | "external-host-digest";
  phase: "attempt" | "settled";
  outcome?: "response" | "network-error";
  targetId?: string;
  injected?: boolean;
}): Promise<void> {
  await controlRequest<{ recorded: true }>("/observe", args);
}
