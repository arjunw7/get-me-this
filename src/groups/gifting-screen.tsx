import { setGiftEntryStatusAction } from "@/src/groups/gifting-actions";
import { budgetLine, statusLabel } from "@/src/groups/gifting-view";

export type ChecklistRow = {
  recipientUserId: string | null;
  recipientDisplayName: string;
  recipientIsOrganizer: boolean | null;
  entryStatus: "todo" | "completed" | null;
  entryVersion: number | null;
  entryCompletedAt: string | null;
  participatingMemberCount: number | null;
  budgetAmountMinor: number | null;
  budgetCurrency: string | null;
  isSentinel: boolean;
};

/**
 * The gift-everyone checklist screen (brief 008b): the giver's own private
 * tracker. Each row shows the recipient's display name, a truthful textual
 * state, the per-person budget guidance line, and one action per state.
 * The recipient never sees any of this about themselves.
 */
export function GiftingScreen({
  groupId,
  groupName,
  rows,
  conflict,
}: {
  groupId: string;
  groupName: string;
  rows: ChecklistRow[];
  conflict: boolean;
}) {
  const sentinel = rows.find((row) => row.isSentinel);

  return (
    <section
      aria-labelledby="gifting-heading"
      className="mx-auto w-full max-w-xl px-4 py-8"
    >
      <h1 id="gifting-heading" className="text-3xl font-bold">
        {groupName}
      </h1>
      <h2 className="mt-4 text-xl font-semibold">My gifting checklist</h2>

      {conflict ? (
        <p
          role="alert"
          className="mt-4 rounded-surface border border-outline-strong bg-surface-raised p-3 text-sm"
        >
          Someone already updated this entry — this list now shows the current
          state. Nothing was overwritten.
        </p>
      ) : null}

      {sentinel ? (
        <p className="mt-6 text-base" data-testid="checklist-empty">
          You are the only participating member right now, so there is nobody to
          gift yet.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3" data-testid="checklist-rows">
          {rows
            .filter((row) => !row.isSentinel)
            .map((row) => (
              <li
                key={row.recipientUserId}
                className="rounded-surface border border-outline-strong bg-surface-raised p-4 shadow-chunk-sm"
              >
                <p className="text-base font-semibold">
                  {row.recipientDisplayName}
                  {row.recipientIsOrganizer ? " (Organizer)" : ""}
                </p>
                <p className="mt-1 text-sm">
                  State: <strong>{statusLabel(row.entryStatus)}</strong>
                </p>
                {budgetLine(row.budgetAmountMinor, row.budgetCurrency) ? (
                  <p className="mt-1 text-sm">
                    {budgetLine(row.budgetAmountMinor, row.budgetCurrency)}
                  </p>
                ) : null}
                <form action={setGiftEntryStatusAction} className="mt-3">
                  <input type="hidden" name="groupId" value={groupId} />
                  <input
                    type="hidden"
                    name="recipientId"
                    value={row.recipientUserId ?? ""}
                  />
                  <input
                    type="hidden"
                    name="expectedVersion"
                    value={row.entryVersion ?? ""}
                  />
                  <input
                    type="hidden"
                    name="status"
                    value={
                      row.entryStatus === "completed" ? "todo" : "completed"
                    }
                  />
                  <button
                    type="submit"
                    className="min-h-11 rounded-surface bg-action-primary px-4 py-2 text-sm font-semibold text-surface-page"
                  >
                    {row.entryStatus === "completed"
                      ? "Reopen"
                      : "Mark completed"}
                  </button>
                </form>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
