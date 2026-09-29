import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AUTH_LINK_CARRY_MAX_AGE_SECONDS } from "./flow-config";
import {
  encodeLinkEnvelope,
  linkCookieOptions,
  parseLinkEnvelope,
  parseLinkLandingQuery,
} from "./link-cookie";

/**
 * The 004d link-carriage envelope and GET-query validation: the signed
 * envelope rejects tampered, forged, expired, and malformed values exactly
 * like a missing cookie, and the link cookie is parkable only from a valid
 * query (present token_hash, closed `type` enum).
 */

const SECRET = "test-secret";
const NOW_MS = 1_800_000_000_000;

function paramsFor(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

beforeEach(() => {
  process.env.AUTH_LINK_COOKIE_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.AUTH_LINK_COOKIE_SECRET;
});

describe("encodeLinkEnvelope / parseLinkEnvelope", () => {
  it("round-trips a valid payload", async () => {
    const envelope = await encodeLinkEnvelope(
      "tok-hash",
      "email",
      NOW_MS,
      SECRET,
    );
    const parsed = await parseLinkEnvelope(envelope, NOW_MS + 1000, SECRET);
    expect(parsed).toEqual({
      tokenHash: "tok-hash",
      type: "email",
      issuedAt: Math.floor(NOW_MS / 1000),
    });
  });

  it("accepts a payload within (but not past) the named carry window", async () => {
    const envelope = await encodeLinkEnvelope(
      "tok-hash",
      "email",
      NOW_MS,
      SECRET,
    );
    const withinWindow = await parseLinkEnvelope(
      envelope,
      NOW_MS + (AUTH_LINK_CARRY_MAX_AGE_SECONDS - 1) * 1000,
      SECRET,
    );
    expect(withinWindow).not.toBeNull();
    const pastWindow = await parseLinkEnvelope(
      envelope,
      NOW_MS + (AUTH_LINK_CARRY_MAX_AGE_SECONDS + 1) * 1000,
      SECRET,
    );
    expect(pastWindow).toBeNull();
  });

  it("rejects a forged future issuedAt — same as a missing cookie", async () => {
    const envelope = await encodeLinkEnvelope(
      "tok-hash",
      "email",
      NOW_MS,
      SECRET,
    );
    const [payloadPart, signaturePart] = envelope.split(".");
    // Decode the payload, push issuedAt into the future, re-encode.
    const decoded = Buffer.from(
      payloadPart!.replaceAll("-", "+").replaceAll("_", "/"),
      "base64",
    ).toString("utf8");
    const payload = JSON.parse(decoded) as { issuedAt: number };
    payload.issuedAt = Math.floor(NOW_MS / 1000) + 9999;
    const forgedPayload = Buffer.from(JSON.stringify(payload))
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    const forged = `${forgedPayload}.${signaturePart}`;
    expect(await parseLinkEnvelope(forged, NOW_MS, SECRET)).toBeNull();
  });

  it("rejects an altered payload with the original signature", async () => {
    const envelope = await encodeLinkEnvelope(
      "tok-hash",
      "email",
      NOW_MS,
      SECRET,
    );
    const [, signaturePart] = envelope.split(".");
    const otherPayload = Buffer.from(
      JSON.stringify({ tokenHash: "evil", type: "email", issuedAt: 1 }),
    )
      .toString("base64")
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    expect(
      await parseLinkEnvelope(
        `${otherPayload}.${signaturePart}`,
        NOW_MS,
        SECRET,
      ),
    ).toBeNull();
  });

  it("rejects a signature verified under the wrong secret", async () => {
    const envelope = await encodeLinkEnvelope(
      "tok-hash",
      "email",
      NOW_MS,
      SECRET,
    );
    expect(
      await parseLinkEnvelope(envelope, NOW_MS, "another-secret"),
    ).toBeNull();
  });

  it("rejects absent, truncated, and malformed envelopes", async () => {
    const envelope = await encodeLinkEnvelope(
      "tok-hash",
      "email",
      NOW_MS,
      SECRET,
    );
    expect(await parseLinkEnvelope(undefined, NOW_MS, SECRET)).toBeNull();
    expect(await parseLinkEnvelope("", NOW_MS, SECRET)).toBeNull();
    expect(await parseLinkEnvelope("garbage", NOW_MS, SECRET)).toBeNull();
    expect(await parseLinkEnvelope(`.${envelope}`, NOW_MS, SECRET)).toBeNull();
    // A truncated envelope (cut before the signature separator) is malformed.
    expect(
      await parseLinkEnvelope(envelope.slice(0, 6), NOW_MS, SECRET),
    ).toBeNull();
    // Invalid base64url payload characters.
    expect(
      await parseLinkEnvelope(
        `%%%invalid%%$.${"x".repeat(43)}`,
        NOW_MS,
        SECRET,
      ),
    ).toBeNull();
  });

  it("rejects a wrong-type payload (closed enum) even when signed", async () => {
    const forged = await encodeLinkEnvelope(
      "tok-hash",
      // The encoder's type is compile-time checked; force a bad value at
      // runtime through the parse path instead by signing with a cast.
      "evil" as never,
      NOW_MS,
      SECRET,
    );
    expect(await parseLinkEnvelope(forged, NOW_MS, SECRET)).toBeNull();
  });

  it("rejects an empty token hash", async () => {
    const envelope = await encodeLinkEnvelope("", "email", NOW_MS, SECRET);
    expect(await parseLinkEnvelope(envelope, NOW_MS, SECRET)).toBeNull();
  });
});

describe("parseLinkLandingQuery", () => {
  it("accepts the exact 004c link form", () => {
    expect(
      parseLinkLandingQuery(paramsFor("token_hash=abc123&type=email")),
    ).toEqual({ tokenHash: "abc123" });
  });

  it("rejects missing, empty, and oversized token hashes", () => {
    expect(parseLinkLandingQuery(paramsFor("type=email"))).toBeNull();
    expect(
      parseLinkLandingQuery(paramsFor("token_hash=&type=email")),
    ).toBeNull();
    expect(
      parseLinkLandingQuery(
        paramsFor(`token_hash=${"x".repeat(513)}&type=email`),
      ),
    ).toBeNull();
  });

  it("rejects unexpected type values (closed enum, no error leak)", () => {
    expect(
      parseLinkLandingQuery(paramsFor("token_hash=abc&type=magiclink")),
    ).toBeNull();
    expect(
      parseLinkLandingQuery(paramsFor("token_hash=abc&type=signup")),
    ).toBeNull();
    expect(parseLinkLandingQuery(paramsFor("token_hash=abc"))).toBeNull();
    expect(parseLinkLandingQuery(paramsFor("token_hash=abc&type="))).toBeNull();
  });
});

describe("linkCookieOptions", () => {
  it("mirrors the approved carry-cookie pattern, scoped to /auth", () => {
    expect(linkCookieOptions(3600)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/auth",
      maxAge: 3600,
    });
  });
});
