"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Restore a fragment jump after hydration and streamed content have settled. */
export function FragmentTarget({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    let frame: number | null = null;
    let pending = false;
    const matches = () => window.location.hash === `#${id}`;

    function cancel() {
      pending = false;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      observer.disconnect();
    }

    function schedule() {
      if (!pending || !matches()) return;
      if (frame !== null) window.cancelAnimationFrame(frame);
      // Next can restore the route scroll during the same commit. Defer until
      // after its frame, then measure again rather than capturing an old offset.
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          frame = null;
          if (!pending || !matches()) return;
          if (!element || element.getBoundingClientRect().height === 0) return;
          element.scrollIntoView({ block: "start", behavior: "instant" });
          cancel();
        });
      });
    }

    const observer = new MutationObserver(schedule);
    function followFragment() {
      cancel();
      if (!matches()) return;
      pending = true;
      // A server-rendered shell can hydrate before its wishlist rows stream in.
      observer.observe(element!, { childList: true, subtree: true });
      schedule();
    }
    function onKey(event: KeyboardEvent) {
      if (
        [
          "ArrowDown",
          "ArrowUp",
          "PageDown",
          "PageUp",
          "Home",
          "End",
          " ",
        ].includes(event.key)
      )
        cancel();
    }

    followFragment();
    window.addEventListener("hashchange", followFragment);
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      cancel();
      window.removeEventListener("hashchange", followFragment);
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("keydown", onKey);
    };
  }, [id]);

  return (
    <div ref={target} id={id} className="scroll-mt-20">
      {children}
    </div>
  );
}
