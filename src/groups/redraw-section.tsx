import type { DrawState } from "./assignment-data";

export type DrawAction = (formData: FormData) => Promise<void>;

/**
 * The organizer-only draw surface (brief 008d), rendered inside the 006d
 * group room for secret_draw groups. It renders exactly the
 * `group_draw_state` result — draw version, drawn date, participant count,
 * roster sync state; existence metadata only, never any pair — and drives
 * `run_secret_draw` through the confirmed server action.
 *
 * The redraw is destructive and surprising, so per DESIGN.md it requires
 * explicit confirmation: the dialog states that every current assignment
 * will be replaced and that members see their new assignments only after
 * the redraw. The confirmed expected version passes through to the
 * compare-and-swap; a `stale` result renders the refreshed state (never a
 * retry that could re-randomize blindly), and
 * `insufficient_participants` renders the neutral blocked state naming the
 * minimum. A `roster_in_sync = false` shows the departure alert required by
 * docs/flows/groups-and-gifting.md — unattributed, never naming a member.
 */
export function RedrawSection({
  groupId,
  drawState,
  drawNotice,
  drawAction,
}: {
  readonly groupId: string;
  readonly drawState: DrawState | null;
  readonly drawNotice: string | null;
  readonly drawAction: DrawAction;
}) {
  const hasDraw = drawState !== null;
  const blocked = drawNotice === "insufficient";

  return (
    <section
      className="mt-10"
      aria-labelledby="draw-heading"
      data-testid="draw-section"
    >
      <h2
        id="draw-heading"
        className="font-display text-heading tracking-tight"
      >
        {hasDraw ? "Secret draw" : "Start the draw"}
      </h2>

      {drawNotice === "drawn" ? (
        <p
          className="mt-3 rounded-surface border-2 border-outline bg-accent-fresh-soft px-4 py-3 font-bold"
          data-testid="draw-drawn"
        >
          The draw is in. Everyone assigned will see their own assignment here,
          and assignment emails are on their way.
        </p>
      ) : null}
      {drawNotice === "stale" ? (
        <p
          className="mt-3 rounded-surface border-2 border-outline bg-accent-highlight-soft px-4 py-3 text-content-secondary"
          data-testid="draw-stale"
        >
          The draw changed while you were confirming — this is the current
          state. Nothing was redrawn.
        </p>
      ) : null}
      {drawNotice === "unavailable" ? (
        <p
          className="mt-3 rounded-surface border-2 border-outline bg-accent-highlight-soft px-4 py-3 text-content-secondary"
          data-testid="draw-unavailable"
        >
          The draw couldn&apos;t run just now. This is the current state.
        </p>
      ) : null}
      {blocked ? (
        <p
          className="mt-3 rounded-surface border-2 border-outline bg-accent-highlight-soft px-4 py-3 text-content-secondary"
          data-testid="draw-blocked"
        >
          The draw needs at least 2 participating members. Invite more people
          and try again once everyone has joined.
        </p>
      ) : null}

      {drawState && drawState.rosterInSync === false ? (
        <p
          role="alert"
          className="mt-3 rounded-surface border-2 border-outline-strong bg-action-primary-soft px-4 py-3 font-bold"
          data-testid="roster-out-of-sync"
        >
          The roster has changed since the draw. Run a fresh draw so everyone
          has a valid assignment.
        </p>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-2" data-testid="draw-state">
        {hasDraw ? (
          <>
            <div className="rounded-surface border-2 border-outline bg-surface-raised px-4 py-3">
              <dt className="text-caption text-content-secondary">Drawn</dt>
              <dd className="font-bold" data-testid="draw-participants">
                {drawState.participantCount}{" "}
                {drawState.participantCount === 1 ? "person" : "people"}
              </dd>
            </div>
            <div className="rounded-surface border-2 border-outline bg-surface-raised px-4 py-3">
              <dt className="text-caption text-content-secondary">Version</dt>
              <dd className="font-bold" data-testid="draw-version">
                #{drawState.drawVersion}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      <details
        className="mt-4 rounded-surface-lg border-2 border-outline-strong bg-surface-raised shadow-chunk-sm"
        data-testid="draw-confirm"
      >
        <summary className="cursor-pointer list-none px-4 py-4 font-display text-heading font-bold">
          <span className="inline-flex min-h-11 items-center">
            {hasDraw ? "Redraw assignments" : "Run the draw"}
          </span>
        </summary>
        <div className="border-t-2 border-dashed border-outline px-4 py-4">
          <p className="text-content-secondary" data-testid="draw-consequences">
            {hasDraw
              ? "Every current assignment will be replaced. Members will see their new assignments only after the redraw."
              : "Everyone participating will be assigned a person to gift. Members will see their own assignment only after the draw."}
          </p>
          <form action={drawAction} className="mt-4">
            <input type="hidden" name="groupId" value={groupId} />
            <input
              type="hidden"
              name="expectedDrawVersion"
              value={drawState?.drawVersion ?? ""}
            />
            <button
              type="submit"
              className="inline-flex h-control-lg min-h-11 items-center justify-center rounded-surface-lg border-2 border-outline-strong bg-action-primary px-6 font-display text-heading font-bold shadow-chunk transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              data-testid="draw-confirm-button"
            >
              {hasDraw ? "Yes, redraw" : "Yes, run the draw"}
            </button>
          </form>
        </div>
      </details>
    </section>
  );
}
