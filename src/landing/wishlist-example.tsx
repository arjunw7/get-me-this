"use client";
/* eslint-disable @next/next/no-img-element -- existing local marketing assets. */

import { useState } from "react";
import { ArrowRightIcon, CheckIcon } from "./icons";
import { buttonClassName } from "@/src/ui/styles";

const examples = [
  { title: "Matcha set", image: "/assets/landing/a-matcha.jpg" },
  { title: "Film camera", image: "/assets/landing/z-camera.jpg" },
];

/** An illustrative share interaction; no clipboard, requests or real public link. */
export function WishlistExample() {
  const [shared, setShared] = useState(false);
  return (
    <section
      id="example"
      aria-label="Example wishlist"
      className="w-full min-w-0 scroll-mt-6 rounded-surface-xl border-2 border-outline-strong bg-surface-raised p-5 shadow-chunk-lg sm:p-7"
    >
      <div className="mb-5 flex items-center justify-between gap-3 text-xs font-bold">
        <span className="text-content-muted">Example</span>
        <span
          className={`rounded-full px-3 py-1.5 ${shared ? "bg-accent-fresh" : "bg-surface-sunken"}`}
        >
          {shared ? "Friend’s view" : "Your view"}
        </span>
      </div>
      <div className="mb-6 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong bg-accent-highlight font-bold"
        >
          AM
        </span>
        <h2 className="font-display text-2xl font-extrabold sm:text-3xl">
          Aanya’s wishlist
        </h2>
      </div>
      <ul className="grid grid-cols-2 gap-4">
        {examples.map((item) => (
          <li key={item.title} className="min-w-0">
            <img
              src={item.image}
              alt=""
              width={220}
              height={220}
              className="aspect-square w-full rounded-surface object-cover"
            />
            <p className="mt-3 font-bold">{item.title}</p>
          </li>
        ))}
      </ul>
      <div
        aria-label="Share from you to a friend"
        className="mt-6 flex items-center justify-center gap-4 text-xs font-bold"
      >
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-highlight"
          >
            AM
          </span>
          You
        </span>
        <ArrowRightIcon className="h-5 w-5" />
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`flex h-8 w-8 items-center justify-center rounded-full ${shared ? "bg-accent-fresh" : "bg-surface-sunken"}`}
          >
            {shared ? <CheckIcon className="h-4 w-4" /> : "F"}
          </span>
          Friend
        </span>
      </div>
      <p
        aria-live="polite"
        aria-atomic="true"
        className="mt-3 min-h-10 text-center text-sm font-semibold text-content-secondary"
      >
        {shared ? "They can browse. No sign-up needed." : ""}
      </p>
      <button
        type="button"
        onClick={() => setShared(!shared)}
        className={
          shared
            ? "min-h-12 w-full cursor-pointer rounded-surface text-sm font-bold underline underline-offset-4 hover:bg-surface-sunken"
            : `${buttonClassName({ variant: "primary", size: "md" })} w-full cursor-pointer`
        }
      >
        {shared ? (
          "Try again"
        ) : (
          <>
            Share this example <ArrowRightIcon className="h-4 w-4" />
          </>
        )}
      </button>
    </section>
  );
}
