import { NextResponse, type NextRequest } from "next/server";
import { NO_REFERRER, NO_STORE } from "./proxy-policy";

export function canonicalHostRedirect(
  request: NextRequest,
): NextResponse | null {
  if (request.headers.get("host")?.toLowerCase() !== "www.getmethis.fun") {
    return null;
  }

  // Fix the origin; never accept a destination from request/forwarded headers.
  const destination = new URL("https://getmethis.fun");
  destination.pathname = request.nextUrl.pathname;
  destination.search = request.nextUrl.search;
  const response = NextResponse.redirect(destination, 308);
  response.headers.set("Cache-Control", NO_STORE);
  response.headers.set("Referrer-Policy", NO_REFERRER);
  return response;
}
