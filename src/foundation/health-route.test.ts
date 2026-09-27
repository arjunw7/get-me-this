import { describe, expect, it } from "vitest";

import { GET, dynamic } from "@/app/health/route";

/**
 * The /health route is the deployment liveness contract: an exact, fixed
 * response that never varies with environment, configuration, or external
 * services. These assertions pin the full contract so any added field,
 * removed header, or loss of dynamic rendering fails verification.
 */

describe("the /health liveness route", () => {
  it("responds with status 200", () => {
    const response = GET();
    expect(response.status).toBe(200);
  });

  it("responds with exactly a single status field set to ok", async () => {
    const response = await GET();
    const body = await response.json();
    // Strict equality: an extra field, a renamed field, or a nested payload
    // all fail this assertion.
    expect(body).toStrictEqual({ status: "ok" });
  });

  it("responds as JSON", async () => {
    const response = await GET();
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("is never cached", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("exports dynamic = force-dynamic so liveness is proven per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});
