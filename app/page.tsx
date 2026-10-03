import { LandingPage } from "@/src/landing/landing-page";
import { getSessionUser } from "@/src/profile/session";

/**
 * The public landing page. The `loggedOut` flag (004e) renders the
 * approved logged-out confirmation after a confirmed sign-out; the normal
 * visit is byte-identical to the committed baseline.
 *
 * ARJ-54: a live session swaps the header's Log in anchor for the
 * Dashboard link. The check is display-only — it renders no protected
 * data — and re-validates with the provider exactly like the protected
 * routes do (the proxy has already refreshed the cookies on this route).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await getSessionUser();
  // `loggedOut=1` is a non-authoritative status message only (static copy,
  // no security impact) and is trivially spoofable; pending an owner
  // decision on a cookie-based approach it stays query-driven.
  return (
    <LandingPage
      loggedOut={params.loggedOut === "1"}
      signedIn={user !== null}
    />
  );
}
