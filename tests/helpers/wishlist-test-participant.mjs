import { randomUUID } from "node:crypto";

const baseUrl = process.env.ARJ28_CONTROL_URL;
const token = process.env.ARJ28_CONTROL_TOKEN;
const caseId = process.env.ARJ28_CASE;
const stage = process.env.ARJ28_STAGE;
const participant = process.env.ARJ28_PARTICIPANT;
const targetId = process.env.ARJ28_TARGET || undefined;

try {
  if (!baseUrl || !token || !caseId || !stage || !participant) process.exit(1);
  const response = await fetch(new URL("/arrive", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-arj28-control-token": token,
    },
    body: JSON.stringify({
      caseId,
      stage,
      participant,
      probeId: randomUUID(),
      targetId,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) process.exit(1);
  const result = await response.json();
  if (result.decision === "released") process.exit(0);
  if (result.decision === "noop") process.exit(10);
  process.exit(1);
} catch {
  process.exit(1);
}
