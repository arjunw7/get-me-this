"use client";
/* eslint-disable @next/next/no-img-element -- existing local marketing assets. */

import { useRef, useState } from "react";
import { ArrowRightIcon, CheckIcon } from "./icons";
import { buttonClassName } from "@/src/ui/styles";

const steps = ["Add an idea", "Your wishlist", "Friend’s view"] as const;
const examples = [
  {
    title: "Speckled matcha set",
    shop: "The ceramics shop",
    image: "/assets/landing/a-matcha.jpg",
    note: "For my slow mornings.",
    price: "₹2,450",
  },
  {
    title: "Half-frame film camera",
    shop: "The camera store",
    image: "/assets/landing/z-camera.jpg",
    note: "For our next trip.",
    price: "₹4,299",
  },
];

/** A self-contained illustration; never reads or writes application data. */
export function WishlistExample() {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("Glazed espresso cups");
  const [note, setNote] = useState("The blue pair, please.");
  const [saved, setSaved] = useState({ title, note });
  const heading = useRef<HTMLHeadingElement>(null);
  function showStep(next: number, moveFocus = false) {
    setStep(next);
    if (moveFocus) requestAnimationFrame(() => heading.current?.focus());
  }
  return (
    <section
      id="example"
      aria-labelledby="example-title"
      className="scroll-mt-6 min-w-0 w-full rounded-surface-xl border-2 border-outline-strong bg-surface-raised shadow-chunk-lg"
    >
      <div className="flex items-center justify-between gap-3 border-b-2 border-outline-strong px-5 py-3">
        <h2 id="example-title" className="text-sm font-bold">
          Try an example
        </h2>
        <span className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-semibold">
          Illustration · not a real list
        </span>
      </div>
      <div
        role="group"
        aria-label="Example steps"
        className="grid grid-cols-3 gap-1 border-b-2 border-outline-strong p-2"
      >
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            aria-pressed={step === index}
            onClick={() => showStep(index)}
            className={`min-h-11 cursor-pointer rounded-surface px-2 py-2 text-xs font-bold sm:text-sm ${step === index ? "bg-outline-strong text-surface-page" : "hover:bg-surface-sunken"}`}
          >
            <span className="block text-xs opacity-80">0{index + 1}</span>
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-b-surface-xl bg-surface-page p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong bg-accent-highlight font-bold"
          >
            AM
          </span>
          <div>
            <h3
              ref={heading}
              tabIndex={-1}
              className="font-display text-2xl font-extrabold"
            >
              {step === 0 ? "Add a little hint" : "Aanya’s wishlist"}
            </h3>
            <p className="text-sm text-content-secondary">
              {step === 0
                ? "An example of reviewing an item"
                : step === 1
                  ? "Birthday ideas & everyday favourites"
                  : "What a friend sees from your link"}
            </p>
          </div>
        </div>
        {step === 0 ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setSaved({ title: title.trim(), note: note.trim() });
              showStep(1, true);
            }}
            className="space-y-4"
          >
            <p className="rounded-surface bg-surface-sunken p-3 text-sm text-content-secondary">
              Paste a product link in your real wishlist, then review its
              details. Missing something? You can always fill it in yourself.
            </p>
            <label className="block text-sm font-bold">
              Item name
              <input
                required
                maxLength={80}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-surface border-2 border-outline-strong bg-surface-raised px-3 py-2 font-normal"
              />
            </label>
            <label className="block text-sm font-bold">
              Your note
              <input
                maxLength={100}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-surface border-2 border-outline-strong bg-surface-raised px-3 py-2 font-normal"
              />
            </label>
            <button
              type="submit"
              disabled={!title.trim()}
              className={`${buttonClassName({ variant: "primary", size: "md" })} w-full cursor-pointer`}
            >
              Save example item <CheckIcon className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <>
            <ul className="space-y-3">
              {[
                ...examples,
                {
                  ...saved,
                  shop: "The homeware shop",
                  image: "/assets/landing/r-cups.jpg",
                  price: "₹1,950",
                },
              ].map((item, index) => (
                <li
                  key={index}
                  className="flex gap-3 rounded-surface border-2 border-outline-strong bg-surface-raised p-2.5"
                >
                  <img
                    src={item.image}
                    alt=""
                    width={76}
                    height={80}
                    className="h-20 w-19 shrink-0 rounded-surface object-cover"
                  />
                  <div className="min-w-0 py-0.5">
                    <p className="font-bold leading-snug break-words">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs text-content-secondary">
                      {item.shop} · {item.price}
                    </p>
                    <p className="mt-1 text-xs break-words text-content-secondary">
                      {item.note}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {step === 1 ? (
              <div className="mt-4">
                <div className="rounded-surface border-2 border-outline-subtle bg-surface-raised p-3">
                  <p className="text-xs font-bold">
                    One link to your whole wishlist
                  </p>
                  <p className="mt-1 break-all text-sm text-content-secondary">
                    getmethis.example/w/aanya
                  </p>
                  <p className="mt-1 text-xs text-content-muted">
                    Illustrative link — try the preview below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => showStep(2, true)}
                  className={`${buttonClassName({ variant: "primary", size: "md" })} mt-4 w-full cursor-pointer`}
                >
                  Preview shared wishlist <ArrowRightIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-surface border-2 border-outline-strong bg-accent-fresh p-3">
                <p className="font-bold">
                  One link. No account needed to browse.
                </p>
                <p className="mt-1 text-sm">
                  Friends open your link, pick an idea, and buy from the
                  original store.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
