import Link from "next/link";

import { Wordmark } from "@/src/landing/wordmark";
import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { readCoordinatorCookie } from "@/src/invite/flow-session";
import { occasionDateText } from "@/src/groups/room-format";
import type { SessionProfile } from "@/src/profile/session";
import { AccountMenu } from "./account-menu";
import { loadMyGroups, type MyGroupSummary } from "./my-groups-data";

const MODE_LABELS: Record<MyGroupSummary["mode"], string> = {
  secret_draw: "Secret draw",
  gift_everyone: "Gift everyone",
  wishlist_only: "Wishlist only",
};

const groupCardClassName =
  "flex min-h-11 flex-col gap-1 rounded-surface-lg border-2 border-outline-strong bg-surface-raised p-5 shadow-chunk-sm outline-offset-4 transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-outline-strong active:translate-x-0.5 active:translate-y-0.5 active:shadow-none sm:p-6";

function GroupCard({ group }: { group: MyGroupSummary }) {
  const occasionDate = occasionDateText(group.occasionAt);
  return (
    <li>
      <Link
        href={`/groups/${group.groupId}`}
        className={groupCardClassName}
        data-testid="my-group-card"
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-display text-heading font-bold">
            {group.groupName}
          </span>
          <span className="rounded-pill border-2 border-outline-strong bg-accent-highlight-soft px-2 py-0.5 text-caption font-bold text-accent-highlight-strong">
            {MODE_LABELS[group.mode]}
          </span>
        </span>
        <span className="text-sm text-content-secondary">
          {occasionDate ?? group.occasion}
          {group.location ? ` · ${group.location}` : null}
          {" · "}
          {group.joinedMemberCount}{" "}
          {group.joinedMemberCount === 1 ? "member" : "members"}
          {group.callerIsOrganizer ? " · You organize" : ""}
        </span>
      </Link>
    </li>
  );
}

/**
 * The authenticated Home, against the pinned V18 `home-new-account`
 * reference: the welcome heading carrying the user's display name, the
 * My groups block backed by the caller's snapshot rows
 * (public.my_groups_snapshot), the My wishlist block linking to the real
 * wishlist, and the sidebar profile block. Loading, empty, and error
 * states are designed (see app/home/loading.tsx and the states below);
 * there is no browser-default state anywhere on the surface.
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
  const [coordinator, groups] = await Promise.all([
    readCoordinatorCookie(),
    loadMyGroups(),
  ]);
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
          <p className="mt-3 max-w-xl text-lg text-content-secondary">
            Save what you want, share it with your people, and give without
            guessing.
          </p>

          <div className="mt-10">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-heading tracking-tight">
                My groups
              </h2>
              <Link
                href="/groups/new"
                className="inline-flex min-h-11 items-center rounded-surface px-3 text-sm font-bold underline decoration-2 underline-offset-4 outline-offset-4 focus-visible:outline-2 focus-visible:outline-outline-strong"
              >
                Create a group
              </Link>
            </div>

            {groups.status === "unavailable" ? (
              <div
                role="status"
                className="mt-4 rounded-surface-lg border-2 border-dashed border-outline bg-surface-raised p-6 text-content-secondary"
              >
                <p className="font-bold text-content-primary">
                  Your groups are unavailable right now.
                </p>
                <p className="mt-1 text-sm">
                  Refresh the page in a moment — your groups are safe.
                </p>
              </div>
            ) : groups.groups.length === 0 ? (
              <div className="mt-4 rounded-surface-lg border-2 border-dashed border-outline bg-surface-raised p-6">
                <p className="font-display text-label font-bold">
                  No groups yet.
                </p>
                <p className="mt-1 text-sm text-content-secondary">
                  Start one for your next occasion, or open an invite link a
                  friend shared with you.
                </p>
                <Link
                  href="/groups/new"
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-surface-lg border-2 border-outline-strong bg-action-primary px-5 font-display text-label font-bold shadow-chunk outline-offset-4 transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-outline-strong active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                >
                  Create a group
                </Link>
              </div>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {groups.groups.map((group) => (
                  <GroupCard key={group.groupId} group={group} />
                ))}
              </ul>
            )}
          </div>

          <div className="mt-10">
            <h2 className="font-display text-heading tracking-tight">
              My wishlist
            </h2>
            <Link
              href="/wishlist"
              data-testid="home-wishlist-link"
              className="mt-4 flex min-h-11 flex-col gap-1 rounded-surface-lg border-2 border-outline-strong bg-surface-raised p-5 shadow-chunk-sm outline-offset-4 transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-outline-strong active:translate-x-0.5 active:translate-y-0.5 active:shadow-none sm:p-6"
            >
              <span className="font-display text-label font-bold">
                Your wishlist is the list of things you actually want.
              </span>
              <span className="text-sm text-content-secondary">
                Add items, reorder, share the link — and give your friends a
                hint.
              </span>
              <span className="mt-2 inline-flex items-center text-sm font-bold underline decoration-2 underline-offset-4">
                Update my wishlist
              </span>
            </Link>
          </div>
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
