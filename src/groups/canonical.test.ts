import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  canonicalPayloadDigest,
  canonicalPayloadSerialization,
} from "./canonical";

/**
 * The canonical payload v1 serialization and digest (brief 006b): the
 * browser binds a draft request key to this digest; the database recomputes
 * its own digest of the same canonical payload — the submitted digest is
 * never trusted.
 */

const payload = {
  contract_version: 1 as const,
  name: "Rohan turns 27",
  occasion_type: "birthday" as const,
  occasion_date: "2026-12-18",
  time_zone: "Asia/Kolkata",
  location: null,
  description: null,
  budget_amount_minor: "250000",
  budget_currency: "INR" as const,
  mode: "secret_draw" as const,
  organizer_participating: true as const,
};

describe("canonicalPayloadSerialization", () => {
  it("is deterministic and includes every canonical field with explicit nulls", () => {
    expect(canonicalPayloadSerialization(payload)).toBe(
      [
        "getmethis:create-group:v1",
        "name=Rohan turns 27",
        "occasion_type=birthday",
        "occasion_date=2026-12-18",
        "time_zone=Asia/Kolkata",
        "location=",
        "description=",
        "budget_amount_minor=250000",
        "budget_currency=INR",
        "mode=secret_draw",
        "",
      ].join("\n"),
    );
  });

  it("distinguishes every differing payload", () => {
    const other = {
      ...payload,
      budget_amount_minor: "250001",
    };
    expect(canonicalPayloadSerialization(payload)).not.toBe(
      canonicalPayloadSerialization(other),
    );
  });
});

describe("canonicalPayloadDigest", () => {
  it("is the SHA-256 hex digest of the canonical serialization", async () => {
    const expected = createHash("sha256")
      .update(canonicalPayloadSerialization(payload), "utf8")
      .digest("hex");
    expect(await canonicalPayloadDigest(payload)).toBe(expected);
  });

  it("changes when the payload changes", async () => {
    const a = await canonicalPayloadDigest(payload);
    const b = await canonicalPayloadDigest({
      ...payload,
      name: "Different",
    });
    expect(a).not.toBe(b);
  });
});
