"use client";

import Link from "next/link";
import { useId, useRef } from "react";
import { STARTER_IDEAS } from "./starter-ideas";

export function StarterIdeasRow() {
  const headingId = useId();
  const row = useRef<HTMLUListElement>(null);
  function scroll(direction: number) {
    row.current?.scrollBy({
      left: direction * 220,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p id={headingId} className="text-sm font-bold text-content-secondary">
          No link handy? Start with an idea
        </p>
        <div className="hidden shrink-0 gap-1 sm:flex">
          {([-1, 1] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              onClick={() => scroll(direction)}
              aria-label={direction < 0 ? "Previous ideas" : "More ideas"}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-outline-strong/20 bg-surface-raised hover:border-outline-strong"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d={direction < 0 ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} />
              </svg>
            </button>
          ))}
        </div>
      </div>
      <ul
        ref={row}
        aria-labelledby={headingId}
        className="-mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pt-1 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {STARTER_IDEAS.map((idea) => (
          <li key={idea.id} className="shrink-0 snap-start">
            <Link
              href={`/wishlist/items/new?pick=${idea.id}`}
              className="flex h-full w-42 flex-col gap-2 rounded-surface border-2 border-outline-strong bg-surface-page p-3.5 text-left transition-transform hover:-translate-y-0.5 hover:shadow-chunk-sm motion-reduce:transform-none"
            >
              <span
                className={`h-5 w-5 rounded-md border-2 border-outline-strong ${idea.tone}`}
                aria-hidden="true"
              />
              <span className="font-display text-[15px] font-extrabold leading-tight">
                {idea.label}
              </span>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-content-muted">
                Add this <span aria-hidden="true">→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
