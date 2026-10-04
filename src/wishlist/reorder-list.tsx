"use client";

import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type { ReorderActionResult } from "./reorder-actions";
import type { WishlistMoveInput } from "./reorder-write";
import type { WishlistItemView } from "./display";
import { DeleteDialog } from "./delete-dialog";
import type { DeleteActionState } from "./item-actions";
import { CardImage } from "./card-image";
import type { OwnerReactionSummary } from "@/src/groups/reactions/reaction-write";
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
  items: readonly WishlistItemView[],
  from: number,
  to: number,
): WishlistItemView[] {
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
  reactionSummaries,
  reorderAction,
  refreshAction,
  deleteAction,
}: {
  items: readonly WishlistItemView[];
  reactionSummaries?: Readonly<Record<string, OwnerReactionSummary>>;
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
  const dragOrigin = useRef<readonly WishlistItemView[]>(items);
  const previewItems = useRef<readonly WishlistItemView[]>(items);
  const dragMode = useRef<"pointer" | "keyboard" | null>(null);
  const dragPointer = useRef<number | null>(null);
  const dragHandle = useRef<HTMLButtonElement | null>(null);
  const stopPointerListeners = useRef<(() => void) | null>(null);
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const instructionsId = useId();
  const restoreKeyboardFocus = useRef(false);
  const reorderToggle = useRef<HTMLButtonElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Moving a keyed DOM row can drop browser focus. Keep keyboard previews
    // visible, then restore their origin after native disabled controls settle.
    if (dragMode.current === "keyboard") {
      dragHandle.current?.focus({ preventScroll: true });
      dragHandle.current?.closest("li")?.scrollIntoView?.({ block: "nearest" });
    } else if (
      restoreKeyboardFocus.current &&
      (phase === "idle" || phase === "recovery")
    ) {
      const target =
        phase === "recovery"
          ? retryButton.current
          : reordering && dragHandle.current?.isConnected
            ? dragHandle.current
            : reorderToggle.current;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: "nearest" });
      restoreKeyboardFocus.current = false;
    }
  }, [displayItems, phase, reordering]);

  useEffect(() => () => stopPointerListeners.current?.(), []);

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
    if (draggedId.current) cancelDrag();
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

  function beginDrag(
    itemId: string,
    handle: HTMLButtonElement,
    mode: "pointer" | "keyboard",
  ) {
    if (phase !== "idle" || draggedId.current) return false;
    draggedId.current = itemId;
    dragOrigin.current = confirmedItems;
    previewItems.current = confirmedItems;
    dragHandle.current = handle;
    dragMode.current = mode;
    setActiveDrag(itemId);
    handle.focus({ preventScroll: true });
    const index = confirmedItems.findIndex((item) => item.id === itemId);
    setAnnouncement(
      `Picked up ${confirmedItems[index]?.title}. Position ${index + 1} of ${confirmedItems.length}.`,
    );
    return true;
  }

  function previewMove(to: number) {
    const current = previewItems.current;
    const from = current.findIndex((item) => item.id === draggedId.current);
    if (from < 0 || to < 0 || to >= current.length || from === to) return;
    const next = movedItems(current, from, to);
    previewItems.current = next;
    setDisplayItems(next);
    setAnnouncement(
      `${current[from]?.title}, position ${to + 1} of ${current.length}.`,
    );
  }

  function clearDrag() {
    stopPointerListeners.current?.();
    stopPointerListeners.current = null;
    const pointerId = dragPointer.current;
    const handle = dragHandle.current;
    draggedId.current = null;
    dragMode.current = null;
    dragPointer.current = null;
    setActiveDrag(null);
    if (pointerId !== null) {
      try {
        handle?.releasePointerCapture?.(pointerId);
      } catch {
        /* A cancelled pointer may already have released capture. */
      }
    }
  }

  function dropDrag() {
    const itemId = draggedId.current;
    if (!itemId) return;
    const from = dragOrigin.current.findIndex((item) => item.id === itemId);
    const to = previewItems.current.findIndex((item) => item.id === itemId);
    restoreKeyboardFocus.current =
      dragMode.current === "keyboard" && from >= 0 && from !== to;
    clearDrag();
    setDisplayItems(dragOrigin.current);
    if (from >= 0 && from !== to) void commitMove(itemId, to);
    else setAnnouncement("Order unchanged.");
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, itemId: string) {
    if (event.button > 0 || event.isPrimary === false) return;
    if (!beginDrag(itemId, event.currentTarget, "pointer")) return;
    event.preventDefault();
    dragPointer.current = event.pointerId;
    // Listen beyond the handle: moving its keyed row can release browser capture.
    // A drop elsewhere in the document still completes this same pointer's move.
    const move = (pointer: globalThis.PointerEvent) => previewDrag(pointer);
    const finish = (pointer: globalThis.PointerEvent) => finishDrag(pointer);
    const cancel = (pointer: globalThis.PointerEvent) => {
      if (pointer.pointerId === dragPointer.current) cancelDrag();
    };
    const blur = () => cancelDrag();
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", blur);
    stopPointerListeners.current = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", blur);
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* Synthetic or released pointers may not support capture. */
    }
  }

  function previewDrag(
    event: Pick<
      globalThis.PointerEvent,
      "pointerId" | "clientX" | "clientY" | "preventDefault"
    >,
  ) {
    if (
      dragMode.current !== "pointer" ||
      event.pointerId !== dragPointer.current
    )
      return;
    event.preventDefault();
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-reorder-id]")?.dataset.reorderId;
    if (target)
      previewMove(previewItems.current.findIndex((item) => item.id === target));
    // touch-action:none makes the handle draggable; edge scrolling still lets a
    // touch user move through a list taller than the viewport.
    if (event.clientY < 64) window.scrollBy({ top: -16, behavior: "instant" });
    else if (event.clientY > window.innerHeight - 64)
      window.scrollBy({ top: 16, behavior: "instant" });
  }

  function finishDrag(event: Pick<globalThis.PointerEvent, "pointerId">) {
    if (
      dragMode.current === "pointer" &&
      event.pointerId === dragPointer.current
    )
      dropDrag();
  }

  function cancelDrag() {
    if (!draggedId.current) return;
    restoreKeyboardFocus.current = dragMode.current === "keyboard";
    clearDrag();
    previewItems.current = dragOrigin.current;
    setDisplayItems(dragOrigin.current);
    setAnnouncement("Move cancelled. Order unchanged.");
  }

  function keyboardDrag(
    event: KeyboardEvent<HTMLButtonElement>,
    itemId: string,
  ) {
    if (phase !== "idle") return;
    if (event.key === "Escape" && draggedId.current === itemId) {
      event.preventDefault();
      cancelDrag();
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!draggedId.current)
        beginDrag(itemId, event.currentTarget, "keyboard");
      else if (dragMode.current === "keyboard" && draggedId.current === itemId)
        dropDrag();
      return;
    }
    if (dragMode.current !== "keyboard" || draggedId.current !== itemId) return;
    const index = previewItems.current.findIndex((item) => item.id === itemId);
    const positions: Partial<Record<string, number>> = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      Home: 0,
      End: previewItems.current.length - 1,
    };
    const next = positions[event.key];
    if (next !== undefined) {
      event.preventDefault();
      previewMove(next);
    } else if (event.key === "Tab") {
      event.preventDefault();
      setAnnouncement(
        "Press Space or Enter to drop, or Escape to cancel this move.",
      );
    }
  }

  if (confirmedItems.length === 0 && !reordering) {
    return <WishlistEmpty />;
  }

  if (confirmedItems.length < 2 && !reordering) {
    return (
      <>
        <div className="mb-6 hidden justify-end sm:flex lg:hidden">
          <AddItemLink />
        </div>
        <WishlistCardGrid
          items={confirmedItems}
          reactionSummaries={reactionSummaries}
        />
      </>
    );
  }

  const busy = phase === "saving" || phase === "refreshing";
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm text-content-secondary">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9 5.5A11 11 0 0 1 21 12a14 14 0 0 1-3 4M6.6 6.6A13 13 0 0 0 3 12s3 7 9 7a11 11 0 0 0 5.4-1.5" />
          </svg>
          You’ll never see what’s been reserved. That’s the point.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            ref={reorderToggle}
            aria-pressed={reordering}
            onClick={() =>
              reordering ? finishReordering() : setReordering(true)
            }
            className={`inline-flex cursor-pointer min-h-touch-min min-w-touch-min items-center justify-center gap-2 rounded-surface border-2 border-outline-strong px-4 text-sm font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action-primary motion-reduce:transition-none ${
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
        <p
          role="status"
          aria-live="polite"
          className={reordering ? "sr-only" : "mb-3 text-sm font-bold"}
        >
          {announcement}
        </p>
      ) : null}

      {reordering ? (
        <div className="max-w-2xl">
          <p className="mb-3 grid text-sm text-content-secondary">
            {/* Keep the full instruction's footprint even while saving. Per-move
                live announcements must never change a pointer's drop geometry. */}
            <span
              aria-hidden={busy ? true : undefined}
              className={`col-start-1 row-start-1 ${busy ? "invisible" : ""}`}
            >
              Drag items into place. Top of the list is what friends see first.
            </span>
            {busy ? (
              <span
                aria-hidden="true"
                className="col-start-1 row-start-1 font-bold"
              >
                {phase === "saving" ? "Saving order…" : "Refreshing order…"}
              </span>
            ) : null}
          </p>
          <p id={instructionsId} className="sr-only">
            Press Space or Enter to pick up an item. Use the up and down arrow
            keys to move it, then Space or Enter to drop. Press Escape to
            cancel.
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
                ref={retryButton}
                onClick={() => void retryRefresh()}
                className="mt-3 min-h-touch-min rounded-surface border-2 border-outline-strong px-4 font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action-primary"
              >
                Retry refresh
              </button>
            </div>
          ) : null}
          <ol aria-busy={busy} className="flex flex-col gap-2.5">
            {displayItems.map((item) => (
              <li
                key={item.id}
                data-reorder-id={item.id}
                className={`flex items-center gap-3 rounded-surface border-2 border-outline-strong bg-surface-raised p-2.5 pr-3 transition-shadow motion-reduce:transition-none ${activeDrag === item.id ? "relative z-10 shadow-chunk ring-2 ring-focus-ring" : ""}`}
              >
                <button
                  type="button"
                  aria-label={`Drag to reorder ${item.title}`}
                  aria-describedby={instructionsId}
                  aria-pressed={activeDrag === item.id}
                  disabled={
                    busy ||
                    phase === "recovery" ||
                    (activeDrag !== null && activeDrag !== item.id)
                  }
                  onKeyDown={(event) => keyboardDrag(event, item.id)}
                  onPointerDown={(event) => startDrag(event, item.id)}
                  className="flex min-h-touch-min min-w-touch-min shrink-0 touch-none cursor-grab items-center justify-center rounded-control text-content-muted hover:bg-surface-sunken active:cursor-grabbing focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action-primary disabled:cursor-not-allowed disabled:opacity-40"
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
                  {item.imageSrc ? (
                    <CardImage src={item.imageSrc} title={item.title} />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-bold">
                    {item.title}
                  </p>
                  <DesireChip level={item.desireLevel} />
                </div>
                <fieldset
                  disabled={busy || phase === "recovery" || activeDrag !== null}
                  className="flex shrink-0 items-center gap-1"
                >
                  <DeleteDialog
                    itemId={item.id}
                    title={item.title}
                    compact
                    deleteActionOverride={deleteAction}
                    onResolved={refreshAfterDeletion}
                  />
                </fieldset>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <WishlistCardGrid
          items={displayItems}
          reactionSummaries={reactionSummaries}
        />
      )}
    </>
  );
}

function AddItemLink() {
  return (
    <Link
      href="/wishlist/items/new"
      className="hidden min-h-touch-min items-center rounded-surface border-2 border-outline-strong bg-action-primary px-5 font-bold text-content-primary shadow-chunk-sm sm:inline-flex lg:hidden"
    >
      Add an item
    </Link>
  );
}
