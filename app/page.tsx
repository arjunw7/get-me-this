import { homepageMetadata, websiteStructuredData } from "@/src/seo/policy";
import { LandingPage } from "@/src/landing/landing-page";
import { getSessionUser } from "@/src/profile/session";

export function generateMetadata() {
  return homepageMetadata();
}

/**
 * The public landing page. The `loggedOut` flag (004e) renders the
 * approved logged-out confirmation after a confirmed sign-out; the normal
 * visit shows the approved wishlist-first landing page.
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
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteStructuredData()).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <LandingPage
        loggedOut={params.loggedOut === "1"}
        signedIn={user !== null}
      />
    </>
  );
}
