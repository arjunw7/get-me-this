import { createServer } from "node:http";

export const WISHLIST_TEST_STAGES = [
  "after-live-key-before-insert",
  "after-unique-conflict-before-lookup",
  "after-max-before-insert",
  "after-edit-read-before-update",
  "postgrest-delete-response-loss",
  "postgrest-delete-pre-dispatch-failure",
  "postgrest-reconcile-read-failure",
  "postgrest-edit-read-failure",
];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const injectionStages = new Set(WISHLIST_TEST_STAGES.slice(4));
const timeoutMs = 15_000;

function json(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let value = "";
  for await (const chunk of request) {
    value += chunk;
    if (value.length > 16_384) throw new Error("body-too-large");
  }
  return value ? JSON.parse(value) : {};
}

function isLoopback(address) {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

function safeId(value) {
  return typeof value === "string" && UUID.test(value);
}

export function createWishlistTestControlServer({
  token,
  host = "127.0.0.1",
  port = 0,
} = {}) {
  if (!token || typeof token !== "string")
    throw new Error("control token required");
  if (!isLoopback(host)) throw new Error("control server must bind loopback");
  const cases = new Map();
  const cleared = new Set();

  const server = createServer(async (request, response) => {
    if (!isLoopback(request.socket.remoteAddress))
      return json(response, 403, { error: "loopback-only" });
    if (request.headers["x-arj28-control-token"] !== token)
      return json(response, 401, { error: "unauthorized" });
    let body;
    try {
      body = await readBody(request);
    } catch {
      return json(response, 400, { error: "invalid-body" });
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "POST" && url.pathname === "/case") {
      if (!safeId(body.caseId))
        return json(response, 400, { error: "invalid-case" });
      if (cleared.has(body.caseId))
        return json(response, 410, { error: "cleared" });
      if (!cases.has(body.caseId))
        cases.set(body.caseId, {
          arms: new Map(),
          probes: new Set(),
          probeResults: [],
          arrivals: [],
          observations: [],
          held: new Map(),
          waiters: new Set(),
          failed: false,
        });
      return json(response, 200, { registered: true });
    }
    if (request.method === "POST" && url.pathname === "/arm") {
      if (!safeId(body.caseId) || !WISHLIST_TEST_STAGES.includes(body.stage))
        return json(response, 400, { error: "invalid-arm" });
      if (cleared.has(body.caseId))
        return json(response, 410, { error: "cleared" });
      let entry = cases.get(body.caseId);
      if (!entry) {
        entry = {
          arms: new Map(),
          probes: new Set(),
          probeResults: [],
          arrivals: [],
          observations: [],
          held: new Map(),
          waiters: new Set(),
          failed: false,
        };
        cases.set(body.caseId, entry);
      }
      if (entry.arms.has(body.stage))
        return json(response, 409, { error: "already-armed" });
      const injection = injectionStages.has(body.stage);
      if (
        injection
          ? body.arrivals !== 1 ||
            body.oneShot !== true ||
            !safeId(body.targetId)
          : ![1, 2].includes(body.arrivals) ||
            body.targetId != null ||
            body.oneShot === true
      )
        return json(response, 400, { error: "invalid-arm" });
      entry.arms.set(body.stage, {
        expected: body.arrivals,
        targetId: body.targetId ?? null,
        oneShot: injection,
        consumed: false,
        participants: new Set(),
      });
      return json(response, 200, { armed: true });
    }
    const protectedCaseId = body.caseId ?? url.searchParams.get("caseId");
    if (!safeId(protectedCaseId))
      return json(response, 400, { error: "invalid-case" });
    if (cleared.has(protectedCaseId))
      return json(response, 410, { error: "cleared" });
    const entry = cases.get(protectedCaseId);
    if (!entry) return json(response, 404, { error: "unknown-case" });
    if (request.method === "POST" && url.pathname === "/arrive") {
      const { stage, participant, probeId, targetId } = body;
      if (
        !WISHLIST_TEST_STAGES.includes(stage) ||
        !["first", "second"].includes(participant) ||
        !safeId(probeId) ||
        (targetId != null && !safeId(targetId))
      ) {
        entry.failed = true;
        return json(response, 400, { error: "invalid-probe" });
      }
      if (entry.probes.has(probeId)) {
        entry.failed = true;
        return json(response, 409, { error: "duplicate-probe" });
      }
      entry.probes.add(probeId);
      const arm = entry.arms.get(stage);
      if (!arm) {
        entry.probeResults.push({
          stage,
          participant,
          probeId,
          targetId: targetId ?? null,
          decision: "noop",
          reason: "unarmed",
        });
        return json(response, 200, { decision: "noop", reason: "unarmed" });
      }
      if (arm.targetId && arm.targetId !== targetId) {
        entry.probeResults.push({
          stage,
          participant,
          probeId,
          targetId: targetId ?? null,
          decision: "noop",
          reason: "target-mismatch",
        });
        return json(response, 200, {
          decision: "noop",
          reason: "target-mismatch",
        });
      }
      if (arm.consumed || arm.participants.size >= arm.expected) {
        entry.probeResults.push({
          stage,
          participant,
          probeId,
          targetId: targetId ?? null,
          decision: "noop",
          reason: "consumed",
        });
        return json(response, 200, { decision: "noop", reason: "consumed" });
      }
      if (arm.participants.has(participant)) {
        entry.failed = true;
        return json(response, 409, { error: "duplicate-participant" });
      }
      arm.participants.add(participant);
      if (arm.oneShot) arm.consumed = true;
      const holdId = `${stage}:${participant}`;
      entry.arrivals.push({
        stage,
        participant,
        probeId,
        targetId: targetId ?? null,
      });
      entry.probeResults.push({
        stage,
        participant,
        probeId,
        targetId: targetId ?? null,
        decision: "claimed",
      });
      for (const waiter of [...entry.waiters]) {
        if (
          entry.arrivals.filter((event) => event.stage === waiter.stage)
            .length >= waiter.expected
        ) {
          entry.waiters.delete(waiter);
          waiter.resolve();
        }
      }
      const effect =
        stage === "postgrest-delete-response-loss"
          ? "delete-response-loss"
          : stage === "postgrest-delete-pre-dispatch-failure"
            ? "delete-pre-dispatch-failure"
            : injectionStages.has(stage)
              ? "owner-read-abort"
              : "continue";
      if (arm.oneShot) {
        json(response, 200, { decision: "released", effect });
        return;
      }
      const timer = setTimeout(() => {
        entry.failed = true;
        entry.held.delete(holdId);
        json(response, 504, { error: "hold-timeout" });
      }, timeoutMs);
      entry.held.set(holdId, { response, timer, effect });
      return;
    }
    if (request.method === "GET" && url.pathname === "/wait") {
      const stage = url.searchParams.get("stage");
      if (!WISHLIST_TEST_STAGES.includes(stage))
        return json(response, 400, { error: "invalid-stage" });
      const arm = entry.arms.get(stage);
      if (!arm) return json(response, 400, { error: "unarmed" });
      const ready = () =>
        entry.arrivals.filter((event) => event.stage === stage).length >=
        arm.expected;
      if (ready())
        return json(response, entry.failed ? 500 : 200, { ready: true });
      const waiter = { reject: () => {}, stage, expected: arm.expected };
      const timer = setTimeout(() => {
        entry.waiters.delete(waiter);
        entry.failed = true;
        json(response, 504, { error: "wait-timeout" });
      }, timeoutMs);
      waiter.reject = (error) => {
        clearTimeout(timer);
        json(response, 410, { error: error.message });
      };
      waiter.resolve = () => {
        clearTimeout(timer);
        json(response, 200, { ready: true });
      };
      entry.waiters.add(waiter);
      if (ready()) {
        entry.waiters.delete(waiter);
        waiter.resolve();
      }
      return;
    }
    if (request.method === "POST" && url.pathname === "/release") {
      const stage = body.stage;
      if (!WISHLIST_TEST_STAGES.includes(stage))
        return json(response, 400, { error: "invalid-stage" });
      const held = [...entry.held.entries()].filter(
        ([key]) =>
          key.startsWith(`${stage}:`) &&
          (!body.participant || key === `${stage}:${body.participant}`),
      );
      if (!held.length)
        return json(response, 409, { error: "no-held-arrival" });
      for (const [key, claim] of held) {
        clearTimeout(claim.timer);
        entry.held.delete(key);
        json(claim.response, 200, {
          decision: "released",
          effect: claim.effect,
        });
      }
      return json(response, 200, { released: held.length });
    }
    if (request.method === "POST" && url.pathname === "/observe") {
      const { participant, kind, phase, outcome, targetId, injected } = body;
      if (
        !["first", "second"].includes(participant) ||
        !["local-auth", "local-rest", "external-host-digest"].includes(kind) ||
        !["attempt", "settled"].includes(phase) ||
        (phase === "settled" &&
          !["response", "network-error"].includes(outcome)) ||
        (targetId != null && !safeId(targetId)) ||
        (injected === true &&
          !(phase === "settled" && outcome === "network-error"))
      )
        return json(response, 400, { error: "invalid-observation" });
      entry.observations.push({
        participant,
        kind,
        phase,
        outcome: outcome ?? null,
        targetId: targetId ?? null,
        injected: injected === true,
      });
      return json(response, 200, { recorded: true });
    }
    if (request.method === "GET" && url.pathname === "/events")
      return json(response, 200, {
        probes: entry.probeResults,
        arrivals: entry.arrivals,
        observations: entry.observations,
        failed: entry.failed,
      });
    if (request.method === "POST" && url.pathname === "/clear") {
      for (const waiter of entry.waiters) waiter.reject(new Error("cleared"));
      entry.waiters.clear();
      for (const claim of entry.held.values()) {
        clearTimeout(claim.timer);
        json(claim.response, 410, { error: "cleared" });
      }
      entry.held.clear();
      cases.delete(protectedCaseId);
      cleared.add(protectedCaseId);
      return json(response, 200, { cleared: true });
    }
    return json(response, 404, { error: "not-found" });
  });
  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve(server.address()));
      }),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const token = process.env.E2E_WISHLIST_CONTROL_TOKEN;
  const port = Number(process.env.E2E_WISHLIST_CONTROL_PORT ?? "3199");
  const control = createWishlistTestControlServer({
    token,
    host: "127.0.0.1",
    port,
  });
  await control.listen();
  process.stdout.write(`wishlist test control ready on 127.0.0.1:${port}\n`);
}
