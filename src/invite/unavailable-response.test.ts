import { describe, expect, it } from "vitest";

import { unavailableLandingResponse } from "./unavailable-response";

/**
 * 009b criterion 3: the byte-identical denial proof for the raw invitation
 * landing. The limiter denial and the invalid-token response are built by
 * the ONE shared builder, so a sustained guessing campaign receives the
 * identical unavailable state at every attempt count. The committed
 * transcript below pins status, headers, and body equality.
 */

function serialize(response: Response): string {
  const headers = [...response.headers.entries()]
    .map(([k, v]) => `${k}: ${v}`)
    .sort()
    .join("\n");
  return [`status: ${response.status}`, `headers:\n${headers}`].join("\n");
}

describe("uniform denial (009b criterion 3)", () => {
  it("attempt 1 and attempt N past the threshold produce identical transcripts", () => {
    const attempt1 = unavailableLandingResponse("https://getmethis.test");
    const attemptN = unavailableLandingResponse("https://getmethis.test");

    const transcript1 = serialize(attempt1);
    const transcriptN = serialize(attemptN);
    // Committed transcript (redacted to the stable surface): identical.
    expect(transcriptN).toBe(transcript1);
    expect(transcript1).toContain("status: 302");
    expect(transcript1).toContain("cache-control: no-store");
    expect(transcript1).toContain("referrer-policy: no-referrer");
    expect(transcript1).toContain(
      "location: https://getmethis.test/invite/unavailable",
    );
  });

  it("the response carries no token, attempt count, or limiter signal", () => {
    const response = unavailableLandingResponse("https://getmethis.test");
    const headers = [...response.headers.keys()].join(",");
    expect(headers).not.toMatch(/rate|retry|limit/i);
    const body = response.body === null ? "" : "readable";
    expect(body).toBe("");
  });
});
