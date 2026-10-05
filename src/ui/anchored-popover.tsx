"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

/** A bounded, portalled popup that follows its control without being clipped by cards. */
export function AnchoredPopover({
  anchor,
  children,
  onDismiss,
  width = 336,
  heightLimit = 420,
}: {
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  onDismiss: (restoreFocus: boolean) => void;
  width?: number;
  heightLimit?: number;
}) {
  const popup = useRef<HTMLDivElement>(null);
  const dismiss = useRef(onDismiss);
  useLayoutEffect(() => {
    dismiss.current = onDismiss;
  }, [onDismiss]);
  const [position, setPosition] = useState({
    left: 16,
    top: 16,
    width,
    maxHeight: heightLimit,
  });
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;
      const availableBelow = offsetTop + viewportHeight - rect.bottom - 24;
      const availableAbove = rect.top - offsetTop - 24;
      const contentHeight = (popup.current?.scrollHeight ?? heightLimit) + 4;
      const desiredHeight = Math.min(heightLimit, contentHeight);
      const above =
        availableBelow < desiredHeight && availableAbove > availableBelow;
      const popupWidth = Math.min(
        Math.max(width, rect.width),
        viewportWidth - 32,
      );
      const maxHeight = Math.max(
        100,
        Math.min(heightLimit, above ? availableAbove : availableBelow),
      );
      const height = Math.min(contentHeight, maxHeight);
      setPosition({
        left: Math.max(
          offsetLeft + 16,
          Math.min(rect.left, offsetLeft + viewportWidth - popupWidth - 16),
        ),
        top: above
          ? Math.max(offsetTop + 16, rect.top - height - 8)
          : rect.bottom + 8,
        width: popupWidth,
        maxHeight,
      });
    };
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!popup.current?.contains(target) && !anchor.current?.contains(target))
        dismiss.current(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss.current(true);
      }
    };
    place();
    const resize = new ResizeObserver(place);
    if (popup.current) resize.observe(popup.current);
    if (anchor.current) resize.observe(anchor.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [anchor, width, heightLimit]);
  return createPortal(
    <div
      ref={popup}
      style={position}
      className="ph-no-capture fixed z-[120] overflow-y-auto rounded-surface-lg border-2 border-outline-strong bg-surface-raised p-3 text-content-primary shadow-chunk-lg"
      data-ph-no-capture
    >
      {children}
    </div>,
    document.body,
  );
}
