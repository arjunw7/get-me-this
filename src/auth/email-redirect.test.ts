import { describe, expect, it } from "vitest";

import { emailRedirectToForOrigin, requestOrigin } from "./email-redirect";

/**
 * The trusted, environment-specific allowlist behind `emailRedirectTo`
 * (004c): the request origin may only select an allowlisted entry, the
 * returned URL is built entirely from server-side constants, and an
 * unlisted environment fails safely to null.
 */
describe("email redirect allowlist", () => {
  it("maps every trusted origin to its exact /auth/confirm target", () => {
    expect(emailRedirectToForOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000/auth/confirm",
    );
    expect(emailRedirectToForOrigin("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3000/auth/confirm",
    );
    expect(emailRedirectToForOrigin("http://localhost:3100")).toBe(
      "http://localhost:3100/auth/confirm",
    );
    expect(emailRedirectToForOrigin("http://127.0.0.1:3100")).toBe(
      "http://127.0.0.1:3100/auth/confirm",
    );
    expect(
      emailRedirectToForOrigin("https://get-me-this-staging.up.railway.app"),
    ).toBe("https://get-me-this-staging.up.railway.app/auth/confirm");
    expect(emailRedirectToForOrigin("https://staging.getmethis.fun")).toBe(
      "https://staging.getmethis.fun/auth/confirm",
    );
  });

  it("rejects untrusted origins — never client input, never an open redirect", () => {
    expect(emailRedirectToForOrigin("https://evil.example")).toBeNull();
    expect(emailRedirectToForOrigin("//evil.example")).toBeNull();
    expect(emailRedirectToForOrigin("")).toBeNull();
    // A same-allowlist origin with a different path or scheme is not the
    // trusted origin itself.
    expect(
      emailRedirectToForOrigin("http://get-me-this-staging.up.railway.app"),
    ).toBeNull();
    // A lookalike of the trusted custom domain is not trusted.
    expect(
      emailRedirectToForOrigin("https://staging.getmethis.fun.evil.example"),
    ).toBeNull();
    expect(emailRedirectToForOrigin("http://staging.getmethis.fun")).toBeNull();
  });

  it("derives the request origin from server-side request headers", () => {
    expect(requestOrigin("127.0.0.1:3100", null)).toBe("http://127.0.0.1:3100");
    expect(requestOrigin("get-me-this-staging.up.railway.app", "https")).toBe(
      "https://get-me-this-staging.up.railway.app",
    );
    // A client-supplied forwarded protocol cannot mint an arbitrary scheme.
    expect(requestOrigin("127.0.0.1:3000", "ftp")).toBe(
      "http://127.0.0.1:3000",
    );
    expect(requestOrigin(null, "https")).toBeNull();
  });

  it("round-trips: derived request origins select allowlisted targets", () => {
    const origin = requestOrigin("127.0.0.1:3100", null);
    expect(emailRedirectToForOrigin(origin ?? "")).toBe(
      "http://127.0.0.1:3100/auth/confirm",
    );
  });
});
