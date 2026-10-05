import Link from "next/link";
import { InvitePeopleButton } from "./invite-people-button";
import { inviteActionClassName } from "./invite-action-styles";

/** Organizer-only confirmation; invitation access is reverified by the shared modal action. */
export function CreatedScreen({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-gutter py-10 sm:py-14">
      <span className="inline-flex h-16 w-16 -rotate-6 items-center justify-center rounded-pill border-2 border-outline-strong bg-accent-fresh shadow-chunk-sm">
        <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
          <path
            d="M4 12.5 9.5 18 20 6.5"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </span>
      <h1 className="mt-6 font-display text-display-lg leading-[1.02] tracking-tight">
        {groupName} is ready.
      </h1>
      <p className="mt-3 text-lg text-content-secondary">
        Bring your people, then open the group to get started.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-3">
        <InvitePeopleButton groupId={groupId} groupName={groupName} />
        <Link
          href={`/groups/${groupId}`}
          data-testid="open-group"
          className={inviteActionClassName("light")}
        >
          Open group
        </Link>
      </div>
      <Link
        href="/home"
        className="mt-5 inline-flex min-h-11 cursor-pointer items-center text-sm font-bold underline underline-offset-4"
      >
        Go to home
      </Link>
    </div>
  );
}
