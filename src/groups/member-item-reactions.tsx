"use client";

import { useState } from "react";
import { ReactionRow } from "./reactions/reaction-row";
import { reactToMemberItem } from "./member-item-reaction-actions";
import type { ReactionSummaryRow } from "./reactions/types";

export function MemberItemReactions({
  groupId,
  initialSummary,
}: {
  groupId: string;
  initialSummary: ReactionSummaryRow;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [error, setError] = useState(false);
  return (
    <div>
      <ReactionRow
        compact
        summary={summary}
        onReact={async (reaction) => {
          try {
            const result = await reactToMemberItem(
              groupId,
              summary.itemId,
              reaction,
            );
            if (result.kind === "confirmed") {
              setSummary(result.summary);
              setError(false);
            } else setError(true);
          } catch {
            setError(true);
          }
        }}
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-content-secondary">
          Couldn’t save your reaction. Try again.
        </p>
      ) : null}
    </div>
  );
}
