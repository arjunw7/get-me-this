// Non-sensitive application liveness endpoint.
//
// Returns a fixed response: no dependency queries (a dependency-health check
// is an explicit non-goal), no environment or configuration values, and no
// data that could identify a person. `force-dynamic` keeps this route out of
// the build-time prerender, so a 200 response always proves that the running
// server process is alive rather than replaying a cached artifact.
export const dynamic = "force-dynamic";

const healthBody = JSON.stringify({ status: "ok" });

export function GET(): Response {
  return new Response(healthBody, {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
