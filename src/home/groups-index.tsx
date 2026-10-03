import Link from "next/link";
import { Tape } from "@/src/wishlist/tape";
import { occasionDateText } from "@/src/groups/room-format";
import { AppIcon } from "./app-icon";
import { GroupStartForm } from "./group-start-form";
import { GroupJoinForm } from "./group-join-form";
import type { MyGroupsResult } from "./my-groups-data";

export function GroupsIndex({ groups }: { groups: MyGroupsResult }) {
  const hasGroups = groups.status === "ready" && groups.groups.length > 0;
  return (
    <main className="relative mx-auto w-full max-w-6xl px-5 pt-6 sm:px-8 lg:pt-10">
      <Tape className="absolute top-6 right-6 hidden -rotate-6 sm:block" />
      <header>
        <h1 className="pr-8 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {groups.status === "unavailable" || hasGroups
            ? "Your groups"
            : "Start your first group."}
        </h1>
        <p className="mt-1 max-w-3xl text-lg text-content-secondary">
          {groups.status === "unavailable"
            ? "Your people, your occasions."
            : hasGroups
              ? "Your occasions, all in one place. Open a group to see what’s happening."
              : "No groups yet. Pick an occasion to get going, or name it yourself."}
        </p>
      </header>
      {groups.status === "unavailable" ? (
        <section
          role="status"
          className="mt-6 rounded-surface-xl border-2 border-dashed border-outline-strong/35 bg-surface-raised p-6"
        >
          <h2 className="font-display text-xl font-bold">
            Your groups are unavailable right now.
          </h2>
          <p className="mt-2 text-content-secondary">
            Nothing is lost. Try again in a moment.
          </p>
          <Link
            prefetch={false}
            href="/groups"
            className="mt-3 inline-flex min-h-11 items-center font-bold underline underline-offset-4"
          >
            Try again
          </Link>
        </section>
      ) : hasGroups ? (
        <ul className="mt-6 grid gap-4" aria-label="Your groups">
          {groups.groups.map((group) => (
            <li key={group.groupId}>
              <Link
                href={`/groups/${group.groupId}`}
                className="flex flex-wrap items-center justify-between gap-4 rounded-surface-xl border-2 border-outline-strong bg-surface-raised p-5 shadow-chunk hover:bg-surface-sunken"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-surface border-2 border-outline-strong bg-accent-highlight">
                    <AppIcon name="groups" />
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words font-display text-xl font-extrabold">
                      {group.groupName}
                    </span>
                    <span className="mt-1 block text-sm text-content-secondary">
                      {group.occasion} · {occasionDateText(group.occasionAt)} ·{" "}
                      {group.joinedMemberCount}{" "}
                      {group.joinedMemberCount === 1 ? "member" : "members"}
                      {group.callerIsOrganizer ? " · You organize" : ""}
                    </span>
                  </span>
                </span>
                <span className="inline-flex min-h-11 items-center gap-2 text-sm font-bold">
                  Open group <span aria-hidden="true">→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_1fr] lg:items-start lg:gap-8">
        <GroupStartForm hasGroups={hasGroups} />
        <div className="flex flex-col gap-6">
          <GroupJoinForm />
          <p className="rounded-surface border-2 border-dashed border-outline-strong/35 p-4 text-[15px] text-content-secondary">
            Once friends join, they’ll see your wishlist, and you’ll see theirs.
          </p>
        </div>
      </div>
    </main>
  );
}
