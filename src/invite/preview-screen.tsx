import { formatBudget, formatOccasionDate, giftingModeCopy } from "./format";
import { JoinForm } from "./join-form";
import type { InvitePreview } from "./invite-write";

/**
 * The signed-out and signed-in invitation preview (brief 006c): exactly
 * the seven approved ARJ-35 fields — host display name, group name,
 * occasion date, budget amount and currency, gifting mode, and joined
 * member count — with the Version 18 invite-valid card hierarchy and the
 * single dominant Join action.
 *
 * The production preview intentionally omits the prototype's location,
 * occasion label, member avatars, invited count, and Copy-invite-link
 * action: they are outside the approved projection or would require
 * retaining the discarded bearer. Those are documented security
 * differences, not expansions of the public result.
 *
 * The Join action is an explicit same-origin POST; authentication,
 * onboarding, and every other step never create membership.
 */

export function InvitePreviewScreen({
  flowId,
  preview,
  joinAction,
}: {
  readonly flowId: string;
  readonly preview: InvitePreview;
  readonly joinAction: (formData: FormData) => Promise<void>;
}) {
  const budget = formatBudget(
    preview.budgetAmountMinor,
    preview.budgetCurrency,
  );
  const occasion = formatOccasionDate(preview.occasionAt);

  return (
    <div className="mx-auto w-full max-w-xl px-gutter py-10 sm:py-14">
      <span className="inline-flex h-16 w-16 -rotate-6 items-center justify-center rounded-pill border-2 border-outline-strong bg-accent-marigold shadow-chunk-sm">
        <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
          <path
            d="M12 21s-7.5-4.6-9.5-9C1 8.5 3 5 6.5 5c2 0 3.6 1.2 4.5 2.6C11.9 6.2 13.5 5 15.5 5 19 5 21 8.5 21.5 12c.4 4.4-9.5 9-9.5 9Z"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </span>

      <h1 className="mt-6 font-display text-display-lg leading-[1.02] tracking-tight">
        You&apos;re invited to {preview.groupName}.
      </h1>
      <p className="mt-3 text-lg text-content-secondary">
        {preview.hostDisplayName} is hosting{occasion ? ` — ${occasion}` : ""}.{" "}
        {giftingModeCopy(preview.mode)}
      </p>

      <dl className="mt-8 rounded-surface-2xl border-2 border-outline-strong bg-surface-raised p-5 shadow-chunk">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-label font-bold">Group</dt>
          <dd className="text-right font-display text-heading font-bold">
            {preview.groupName}
          </dd>
        </div>
        {occasion ? (
          <div className="mt-3 flex items-center justify-between gap-4 border-t-2 border-dashed border-outline-soft pt-3">
            <dt className="text-label font-bold">When</dt>
            <dd className="text-right font-semibold" suppressHydrationWarning>
              {occasion}
            </dd>
          </div>
        ) : null}
        {budget ? (
          <div className="mt-3 flex items-center justify-between gap-4 border-t-2 border-dashed border-outline-soft pt-3">
            <dt className="text-label font-bold">Budget</dt>
            <dd className="text-right font-semibold" suppressHydrationWarning>
              {budget}
            </dd>
          </div>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-4 border-t-2 border-dashed border-outline-soft pt-3">
          <dt className="text-label font-bold">Gifting</dt>
          <dd className="text-right font-semibold">
            {giftingModeCopy(preview.mode)}
          </dd>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 border-t-2 border-dashed border-outline-soft pt-3">
          <dt className="text-label font-bold">Joined so far</dt>
          <dd className="text-right font-semibold">
            {preview.joinedMemberCount}{" "}
            {preview.joinedMemberCount === 1 ? "member" : "members"}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-caption text-content-secondary">
        Only this preview is public. Group details, members&apos; wishlists, and
        gifting information stay private to members.
      </p>

      <JoinForm action={joinAction} flowId={flowId} />
    </div>
  );
}
