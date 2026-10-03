import Link from "next/link";
import { resolveOwnWishlistView } from "@/src/wishlist/item-views";
import { GettingStarted } from "./getting-started";
import { ActiveHome } from "./active-home";
import { loadHomeDashboard } from "./dashboard-data";

import { AppNavigation } from "./app-navigation";
import { AnalyticsIdentity } from "@/src/auth/analytics-identity";
import { readCoordinatorCookie } from "@/src/invite/flow-session";
import { occasionDateText } from "@/src/groups/room-format";
import type { SessionProfile } from "@/src/profile/session";
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
 * Authenticated Home uses the caller's groups and wishlist to distinguish
 * first-use steps from their existing group overview. All reads retain
 * their existing owner/membership access boundaries.
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
  const now = new Date();
  const [wishlist, dashboard] = await Promise.all([
    resolveOwnWishlistView(userId).catch(() => null),
    groups.status === "ready" && groups.groups.length > 0
      ? loadHomeDashboard(groups.groups, userId, now)
      : null,
  ]);
  const starterWishlist =
    groups.status === "ready" && groups.groups.length === 0 ? wishlist : null;
  const firstName = displayName.trim().split(/\s+/)[0];
  return (
    <div className="min-h-screen w-full bg-surface-page pb-40 text-content-primary lg:pb-16 lg:pl-64">
      <AnalyticsIdentity userId={userId} />
      <AppNavigation
        email={email}
        displayName={displayName}
        tasteLine={profile.tasteLine}
        vibe={profile.vibe}
        brokered={coordinator !== null}
      />

      <main
        className={`mx-auto w-full px-5 pt-6 sm:px-8 lg:pt-10 ${starterWishlist ? "max-w-3xl" : "max-w-6xl"}`}
      >
        <section>
          {dashboard && (
            <p className="text-sm font-semibold text-content-muted">
              {new Intl.DateTimeFormat("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: dashboard.room.timeZone,
              }).format(now)}
            </p>
          )}
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {starterWishlist
              ? `Welcome in, ${firstName}.`
              : `Hey ${firstName}.`}
          </h1>
          {!dashboard && (
            <p className="mt-1 max-w-xl text-lg text-content-secondary">
              {starterWishlist
                ? "Two steps to get your friends gifting you the right stuff."
                : "Save what you want, share it with your people, and give without guessing."}
            </p>
          )}

          {starterWishlist ? (
            <GettingStarted wishlist={starterWishlist} />
          ) : dashboard ? (
            <ActiveHome
              data={dashboard}
              wishlist={wishlist}
              now={now}
              groupCount={groups.status === "ready" ? groups.groups.length : 0}
            />
          ) : (
            <>
              <GroupsContent groups={groups} />

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
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export function GroupsContent({
  groups,
}: {
  groups: import("./my-groups-data").MyGroupsResult;
}) {
  return (
    <div className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-heading tracking-tight">My groups</h2>
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
          <p className="font-display text-label font-bold">No groups yet.</p>
          <p className="mt-1 text-sm text-content-secondary">
            Start one for your next occasion, or open an invite link a friend
            shared with you.
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
  );
}
