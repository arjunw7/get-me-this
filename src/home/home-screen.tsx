import Link from "next/link";

import { Wordmark } from "@/src/landing/wordmark";
import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { readCoordinatorCookie } from "@/src/invite/flow-session";
import { AccountMenu } from "./account-menu";
import type { SessionProfile } from "@/src/profile/session";

/**
 * The minimal, honest authenticated Home (004e), against the pinned V18
 * `home-new-account` frozen reference for the parts backed by real data in
 * this issue: the welcome heading carrying the user's display name and the
 * sidebar profile block (display name and taste line).
 *
 * Everything else the references show — the wishlist and group blocks, the
 * suggestion carousel, the returning-user surfaces, and the account menu's
 * My wishlist / Edit profile entries — targets routes that do not exist
 * until Phase 4+ and is deliberately OMITTED, never faked: the copy below
 * is the approved honest stand-in and gets owner side-by-side review.
 * There is no navigation to routes that don't exist yet.
 */
export async function HomeScreen({
  userId,
  email,
  profile,
}: {
  userId: string;
  email: string | null;
  profile: SessionProfile;
}) {
  const displayName = profile.displayName as string;
  // Brief 006c criterion 12: a live invitation coordinator makes this
  // browser's logout brokered (origin-wide Web Lock + server lease).
  const coordinator = await readCoordinatorCookie();
  return (
    <div className="min-h-screen w-full bg-surface-page text-content-primary">
      <AnalyticsIdentity userId={userId} />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/home" aria-label="Get Me This home">
          <Wordmark className="text-2xl sm:text-3xl" />
        </Link>
        <AccountMenu
          email={email}
          displayName={displayName}
          brokered={coordinator !== null}
        />
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-5 pt-6 pb-16 sm:px-8 lg:grid-cols-[1fr_18rem] lg:pt-14">
        <section>
          <h1 className="font-display text-display-xl sm:text-6xl">
            Welcome, {displayName}.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-content-secondary">
            You’re signed in and your profile is set. Right now this space is
            all there is: your account, this page, and working sign-out.
          </p>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-content-secondary">
            Wishlists and groups aren’t part of the product yet — nothing here
            pretends they are.
          </p>
        </section>

        <aside>
          <div className="rounded-surface-xl border-2 border-outline-strong bg-surface-raised p-6 shadow-chunk-sm">
            <p className="text-caption text-content-muted">Your profile</p>
            <p className="mt-2 font-display text-heading font-bold">
              {displayName}
            </p>
            {profile.tasteLine ? (
              <p className="mt-1 text-sm text-content-secondary">
                {profile.tasteLine}
              </p>
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  );
}
