import type { GiverAssignment } from "./assignment-data";

/**
 * The giver-facing assignment surface (brief 008d), rendered inside the 006d
 * group room for secret_draw groups. It renders exactly what `my_assignment`
 * returns and nothing else:
 *
 * - a valid assignment: the recipient display name with the established
 *   generic **Member** fallback, plus the giver's private seen state;
 * - the neutral `is_valid = false` state: the assignment is no longer valid
 *   and the recipient identity is never rendered — the giver learns only
 *   that the roster changed, and is pointed at the organizer's confirmed
 *   redraw;
 * - zero rows: rendered identically for every denial class (outsider,
 *   pending, left, removed, stale generation, wrong mode, archived, no
 *   draw) — no error difference could ever distinguish those states.
 *
 * Version numbers, generations, tombstone internals, and audit metadata are
 * never rendered. The whole surface is private group content, so
 * autocapture and session replay stay blocked.
 */
export function AssignmentView({
  assignment,
}: {
  readonly assignment: GiverAssignment | null;
}) {
  if (!assignment) {
    return (
      <section
        className="mt-10"
        aria-labelledby="assignment-heading"
        data-testid="assignment-section"
      >
        <h2
          id="assignment-heading"
          className="font-display text-heading tracking-tight"
        >
          Your draw
        </h2>
        <p
          className="mt-3 rounded-surface border-2 border-dashed border-outline bg-surface-raised px-4 py-4 text-content-secondary shadow-chunk-sm"
          data-testid="assignment-empty"
        >
          No assignment to show yet.
        </p>
      </section>
    );
  }

  if (!assignment.isValid) {
    return (
      <section
        className="mt-10"
        aria-labelledby="assignment-heading"
        data-testid="assignment-section"
      >
        <h2
          id="assignment-heading"
          className="font-display text-heading tracking-tight"
        >
          Your draw
        </h2>
        <div
          className="mt-3 rounded-surface border-2 border-outline bg-accent-highlight-soft px-4 py-4 shadow-chunk-sm"
          data-testid="assignment-invalid"
        >
          <p className="font-bold">This assignment is no longer valid.</p>
          <p className="mt-1 text-content-secondary">
            The group roster changed since the draw. Your organizer can run a
            fresh draw — you&apos;ll see your new assignment here once they do.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="mt-10"
      aria-labelledby="assignment-heading"
      data-testid="assignment-section"
    >
      <h2
        id="assignment-heading"
        className="font-display text-heading tracking-tight"
      >
        Your draw
      </h2>
      <div
        className="mt-3 rounded-surface-lg border-2 border-outline-strong bg-surface-raised px-4 py-5 shadow-chunk-sm"
        data-testid="assignment-card"
      >
        <p className="text-caption font-bold uppercase tracking-wide text-content-secondary">
          You&apos;re gifting
        </p>
        <p
          className="mt-1 font-display text-display-sm tracking-tight"
          data-testid="assignment-recipient"
        >
          {assignment.recipientDisplayName ?? "Member"}
        </p>
        <p
          className="mt-2 text-caption text-content-secondary"
          data-testid="assignment-seen-state"
        >
          {assignment.viewedAt === null
            ? "New — you just opened it. Only you can see this."
            : "You've seen this. Only you can see this."}
        </p>
      </div>
    </section>
  );
}
