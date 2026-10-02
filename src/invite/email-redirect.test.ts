import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { invitationEmailRedirectTo } from "./email-redirect";

/**
 * The trusted flow-specific `emailRedirectTo` allowlist (brief 006c): the
 * request origin may only select an allowlisted entry, and the flow id
 * must be a canonical UUID. Every bypass shape — encoded origins,
 * protocol-relative values, backslashes, unexpected paths, foreign
 * origins — fails closed to null.
 */

const FLOW_ID = "0f0a0b0c-1111-4222-8333-444455556666";

describe("invitationEmailRedirectTo", () => {
  it("selects the allowlisted entry and appends the invitation confirm path", () => {
    expect(invitationEmailRedirectTo("http://localhost:3000", FLOW_ID)).toBe(
      `http://localhost:3000/auth/confirm/invite/${FLOW_ID}`,
    );
    expect(
      invitationEmailRedirectTo(
        "https://get-me-this-staging.up.railway.app",
        FLOW_ID,
      ),
    ).toBe(
      `https://get-me-this-staging.up.railway.app/auth/confirm/invite/${FLOW_ID}`,
    );
    expect(
      invitationEmailRedirectTo("https://staging.getmethis.fun", FLOW_ID),
    ).toBe(`https://staging.getmethis.fun/auth/confirm/invite/${FLOW_ID}`);
  });

  it("fails closed for unlisted, malformed, and bypass origins", () => {
    expect(invitationEmailRedirectTo(null, FLOW_ID)).toBeNull();
    expect(
      invitationEmailRedirectTo("https://attacker.invalid", FLOW_ID),
    ).toBeNull();
    expect(
      invitationEmailRedirectTo(
        "https://get-me-this-staging.up.railway.app.attacker.invalid",
        FLOW_ID,
      ),
    ).toBeNull();
    // A protocol-relative or backslash shape can never match the table.
    expect(
      invitationEmailRedirectTo(
        "//get-me-this-staging.up.railway.app",
        FLOW_ID,
      ),
    ).toBeNull();
    expect(
      invitationEmailRedirectTo(
        "https:\\\\get-me-this-staging.up.railway.app",
        FLOW_ID,
      ),
    ).toBeNull();
  });

  it("refuses a non-UUID flow id", () => {
    expect(
      invitationEmailRedirectTo("http://localhost:3000", "../../attacker"),
    ).toBeNull();
    expect(
      invitationEmailRedirectTo("http://localhost:3000", "abc"),
    ).toBeNull();
  });
});
