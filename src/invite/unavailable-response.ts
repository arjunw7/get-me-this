import { NextResponse } from "next/server";

/**
 * The single unavailable-response builder for the raw invitation landing
 * (006c, shared with the 009b limiter denial). The limiter's denial path
 * returns EXACTLY this response — same status, headers, and body — so a
 * rate-limited request is byte-identical to an invalid-token request and
 * no attempt count can become an enumeration oracle.
 */

const NO_STORE = "no-store";
const NO_REFERRER = "no-referrer";

export function unavailableLandingResponse(origin: string): NextResponse {
  const response = NextResponse.redirect(`${origin}/invite/unavailable`, 302);
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("Referrer-Policy", NO_REFERRER);
  return response;
}
