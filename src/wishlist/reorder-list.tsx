"use client";

import Link from "next/link";
import { useRef, useState, type PointerEvent } from "react";

import type { ReorderActionResult } from "./reorder-actions";
import type { WishlistMoveInput } from "./reorder-write";
import type { WishlistItemSnapshot } from "./display";
import { DeleteDialog } from "./delete-dialog";
import type { DeleteActionState } from "./item-actions";
import { CardImage } from "./card-image";
import { DesireChip, WishlistCardGrid, WishlistEmpty } from "./wishlist-card";

type ReorderAction = (input: WishlistMoveInput) => Promise<ReorderActionResult>;
type RefreshAction = () => Promise<ReorderActionResult>;
type DeleteAction = (
  itemId: string,
  previous: DeleteActionState,
  data: FormData,
) => Promise<DeleteActionState>;

type Phase = "idle" | "saving" | "recovery" | "refreshing";

function movedItems(
  items: readonly WishlistItemSnapshot[],
  from: number,
  to: number,
): WishlistItemSnapshot[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (!moved) return next;
  next.splice(to, 0, moved);
  return next;
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function WishlistItemsPanel({
  items,
  reorderAction,
  refreshAction,
  deleteAction,
}: {
  items: readonly WishlistItemSnapshot[];
  reorderAction: ReorderAction;
  refreshAction: RefreshAction;
  deleteAction: DeleteAction;
}) {
  const [reordering, setReordering] = useState(false);
  const [confirmedItems, setConfirmedItems] = useState(items);
  const [displayItems, setDisplayItems] = useState(items);
  const [phase, setPhase] = useState<Phase>("idle");
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [exitPending, setExitPending] = useState(false);
  const exitRequested = useRef(false);
  const draggedId = useRef<string | null>(null);
  const dragOrigin = useRef<readonly WishlistItemSnapshot[]>(items);

  async function commitMove(movedItemId: string, to: number) {
    const before = confirmedItems;
    const from = before.findIndex((item) => item.id === movedItemId);
    if (
      phase !== "idle" ||
      from < 0 ||
      from === to ||
      to < 0 ||
      to >= before.length
    )
      return;
    const moved = before[from];
    if (!moved) return;
    setDisplayItems(movedItems(before, from, to));
    setPhase("saving");
    setAnnouncement("Saving order…");
    let result: ReorderActionResult;
    try {
      result = await reorderAction({
        expectedIds: before.map((item) => item.id),
        movedItemId: moved.id,
        targetIndex: to,
      });
    } catch {
      result = { status: "recovery" };
    }
    if (result.status === "recovery" || result.status === "unavailable") {
      setDisplayItems(before);
      setPhase("recovery");
      setAnnouncement(null);
      return;
    }
    setConfirmedItems(result.items);
    setDisplayItems(result.items);
    setPhase("idle");
    setAnnouncement(
      result.status === "saved"
        ? "Order saved."
        : "Order refreshed. Choose another move if needed.",
    );
    if (exitRequested.current) {
      exitRequested.current = false;
      setExitPending(false);
      setReordering(false);
    }
  }

  function finishReordering() {
    if (phase === "saving" || phase === "refreshing") {
      exitRequested.current = true;
      setExitPending(true);
      return;
    }
    if (phase === "recovery") {
      exitRequested.current = true;
      setExitPending(true);
      return;
    }
    setReordering(false);
  }

  async function retryRefresh() {
    if (phase !== "recovery") return;
    setPhase("refreshing");
    let result: ReorderActionResult;
    try {
      result = await refreshAction();
    } catch {
      result = { status: "recovery" };
    }
    if (result.status === "recovery" || result.status === "unavailable") {
      setPhase("recovery");
      return;
    }
    setConfirmedItems(result.items);
    setDisplayItems(result.items);
    setPhase("idle");
    setAnnouncement("Order refreshed. Choose another move if needed.");
    if (exitRequested.current) {
      exitRequested.current = false;
      setExitPending(false);
      setReordering(false);
    }
  }

  async function refreshAfterDeletion() {
    let result: ReorderActionResult;
    try {
      result = await refreshAction();
    } catch {
      result = { status: "recovery" };
    }
    if (result.status === "recovery" || result.status === "unavailable") {
      setPhase("recovery");
      setAnnouncement(null);
      return;
    }
    setConfirmedItems(result.items);
    setDisplayItems(result.items);
    setAnnouncement("Wishlist refreshed.");
    if (result.items.length < 2) {
      exitRequested.current = false;
      setExitPending(false);
      setReordering(false);
    }
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, itemId: string) {
    if (phase !== "idle") return;
    draggedId.current = itemId;
    dragOrigin.current = confirmedItems;
    // Capture is an optimization for real pointers: the browser throws
    // NotFoundError when the pointer id is not an active pointer (for
    // example a synthetic or already-released pointer). The drag preview
    // below works through elementFromPoint, so a failed capture must not
    // abort the drag.
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Ignore: drag continues without pointer capture.
    }
  }

  function previewDrag(event: PointerEvent<HTMLButtonElement>) {
    const itemId = draggedId.current;
    if (!itemId) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-reorder-id]")?.dataset.reorderId;
    if (!target || target === itemId) return;
    setDisplayItems((current) => {
      const from = current.findIndex((item) => item.id === itemId);
      const to = current.findIndex((item) => item.id === target);
      return from < 0 || to < 0 ? current : movedItems(current, from, to);
    });
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const itemId = draggedId.current;
    draggedId.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Ignore: capture may never have been acquired for this pointer.
    }
    if (!itemId) return;
    const from = dragOrigin.current.findIndex((item) => item.id === itemId);
    const to = displayItems.findIndex((item) => item.id === itemId);
    setDisplayItems(dragOrigin.current);
    if (from >= 0) void commitMove(itemId, to);
  }

  function cancelDrag() {
    draggedId.current = null;
    setDisplayItems(dragOrigin.current);
  }

  if (confirmedItems.length === 0 && !reordering) {
    return <WishlistEmpty />;
  }

  if (confirmedItems.length < 2 && !reordering) {
    return (
      <>
        <div className="mb-6 flex justify-end">
          <AddItemLink />
        </div>
        <WishlistCardGrid items={confirmedItems} />
      </>
    );
  }

  const busy = phase === "saving" || phase === "refreshing";
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-content-secondary">
          You’ll never see what’s been reserved. That’s the point.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={reordering}
            onClick={() =>
              reordering ? finishReordering() : setReordering(true)
            }
            className={`inline-flex min-h-touch-min min-w-touch-min items-center justify-center gap-2 rounded-surface border-2 border-outline-strong px-4 text-sm font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action-primary motion-reduce:transition-none ${
              reordering
                ? "bg-content-primary text-surface-page"
                : "bg-surface-raised text-content-primary"
            }`}
          >
            <Icon>
              {reordering ? (
                <path d="m5 12 4 4L19 6" />
              ) : (
                <>
                  <path d="m8 7 4-4 4 4" />
                  <path d="M12 3v18" />
                  <path d="m8 17 4 4 4-4" />
                </>
              )}
            </Icon>
            {reordering
              ? exitPending && busy
                ? "Finishing…"
                : "Done"
              : "Reorder"}
          </button>
          {!reordering ? <AddItemLink /> : null}
        </div>
      </div>

      {announcement ? (
        <p role="status" aria-live="polite" className="mb-3 text-sm font-bold">
          {announcement}
        </p>
      ) : null}

      {reordering ? (
        <div className="max-w-2xl">
          <p className="mb-3 text-sm text-content-secondary">
            Drag or use the arrows. Top of the list is what friends see first.
          </p>
          {phase === "recovery" ? (
            <div
              role="alert"
              className="mb-3 rounded-surface border-2 border-feedback-error bg-surface-raised p-4"
            >
              <p className="font-bold">We couldn’t confirm the saved order.</p>
              <p className="mt-1 text-sm text-content-secondary">
                Refresh your wishlist before making another move.
              </p>
              <button
                type="button"
                onClick={() => void retryRefresh()}
                className="mt-3 min-h-touch-min rounded-surface border-2 border-outline-strong px-4 font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
              >
                Retry refresh
              </button>
            </div>
          ) : null}
          <ol className="flex flex-col gap-2.5">
            {displayItems.map((item, index) => (
              <li
                key={item.id}
                data-reorder-id={item.id}
                className="flex items-center gap-2 rounded-surface-lg border-2 border-outline-strong bg-surface-raised p-2.5 motion-reduce:transition-none"
              >
                <button
                  type="button"
                  aria-label={`Drag to reorder ${item.title}`}
                  disabled={busy || phase === "recovery"}
                  onPointerDown={(event) => startDrag(event, item.id)}
                  onPointerMove={previewDrag}
                  onPointerUp={finishDrag}
                  onPointerCancel={cancelDrag}
                  className="flex min-h-touch-min min-w-touch-min shrink-0 touch-none cursor-grab items-center justify-center rounded-surface-sm text-content-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon>
                    <circle cx="9" cy="6" r="1" fill="currentColor" />
                    <circle cx="15" cy="6" r="1" fill="currentColor" />
                    <circle cx="9" cy="12" r="1" fill="currentColor" />
                    <circle cx="15" cy="12" r="1" fill="currentColor" />
                    <circle cx="9" cy="18" r="1" fill="currentColor" />
                    <circle cx="15" cy="18" r="1" fill="currentColor" />
                  </Icon>
                </button>
                <span
                  aria-hidden="true"
                  className="h-14 w-14 shrink-0 overflow-hidden rounded-surface border-2 border-outline-strong bg-surface-sunken"
                >
                  {item.imageUrl ? (
                    <CardImage src={item.imageUrl} title={item.title} />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-bold">
                    {item.title}
                  </p>
                  <DesireChip level={item.desireLevel} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <MoveButton
                    direction="up"
                    item={item}
                    disabled={busy || phase === "recovery" || index === 0}
                    onClick={() => void commitMove(item.id, index - 1)}
                  />
                  <MoveButton
                    direction="down"
                    item={item}
                    disabled={
                      busy ||
                      phase === "recovery" ||
                      index === displayItems.length - 1
                    }
                    onClick={() => void commitMove(item.id, index + 1)}
                  />
                  <DeleteDialog
                    itemId={item.id}
                    title={item.title}
                    compact
                    deleteActionOverride={deleteAction}
                    onResolved={refreshAfterDeletion}
                  />
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <WishlistCardGrid items={displayItems} />
      )}
    </>
  );
}

function MoveButton({
  direction,
  item,
  disabled,
  onClick,
}: {
  direction: "up" | "down";
  item: WishlistItemSnapshot;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Move ${item.title} ${direction}`}
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-touch-min min-w-touch-min items-center justify-center rounded-surface-sm focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action-primary disabled:opacity-30"
    >
      <Icon>
        {direction === "up" ? (
          <path d="m6 15 6-6 6 6" />
        ) : (
          <path d="m6 9 6 6 6-6" />
        )}
      </Icon>
    </button>
  );
}

function AddItemLink() {
  return (
    <Link
      href="/wishlist/items/new"
      className="inline-flex min-h-touch-min items-center rounded-surface border-2 border-outline-strong bg-action-primary px-5 font-bold text-content-primary shadow-chunk-sm"
    >
      Add an item
    </Link>
  );
}
