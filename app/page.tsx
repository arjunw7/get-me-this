import { LandingPage } from "@/src/landing/landing-page";

/**
 * The public landing page. The `loggedOut` flag (004e) renders the
 * approved logged-out confirmation after a confirmed sign-out; the normal
 * visit is byte-identical to the committed baseline.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // `loggedOut=1` is a non-authoritative status message only (static copy,
  // no security impact) and is trivially spoofable; pending an owner
  // decision on a cookie-based approach it stays query-driven.
  return <LandingPage loggedOut={params.loggedOut === "1"} />;
}
