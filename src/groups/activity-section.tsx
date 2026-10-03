import {
  activityEntryIcon,
  activityEntryKey,
  activityEntryText,
} from "./activity-view";

import type { ActivityEntry } from "./activity-data";

/**
 * The group room's activity section (brief 007d): the authorized,
 * per-viewer-filtered entries rendered with the product's tone. The
 * projection has already applied the visibility matrix; this component
 * only presents what it received — state-only reservation wording and
 * self-labelling come pre-decided through `involvesViewer`.
 *
 * The empty state says there is no activity yet without inviting actions
 * the viewer cannot take. The section is a new visual candidate pending
 * independent product/design review, so it intentionally reuses the room's
 * established card language (chunky rounded cards, dark outlines, offset
 * shadows) and introduces no new tokens.
 */
export function GroupActivitySection({
  entries,
}: {
  readonly entries: readonly ActivityEntry[];
}) {
  return (
    <section className="mt-10" data-testid="activity-section">
      <h2
        id="activity-heading"
        className="font-display text-heading tracking-tight"
      >
        Recent activity
      </h2>
      <p className="mt-1 text-caption text-content-secondary">
        What&apos;s been happening in the group.
      </p>

      {entries.length === 0 ? (
        <p
          className="mt-4 rounded-surface border-2 border-dashed border-outline bg-surface-raised px-4 py-4 text-body text-content-secondary"
          data-testid="activity-empty"
        >
          No activity yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2" data-testid="activity-list">
          {entries.map((entry, index) => {
            const text = activityEntryText(entry);
            return (
              <li
                key={activityEntryKey(entry, index)}
                className="flex items-center gap-3 rounded-surface border-2 border-outline-strong bg-surface-raised px-4 py-3 shadow-chunk-sm"
                data-testid={
                  entry.involvesViewer
                    ? "activity-entry-self"
                    : "activity-entry"
                }
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-outline bg-surface-page text-base"
                >
                  {activityEntryIcon(entry)}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-body ${entry.involvesViewer ? "font-bold" : ""}`}
                    title={text}
                  >
                    {text}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
