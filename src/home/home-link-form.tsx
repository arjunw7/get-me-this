"use client";

import { useRef, useState } from "react";

/** Pass the user's link to the existing, server-validated extraction flow. */
export function HomeLinkForm() {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (input.current) {
        input.current.value = text.slice(0, 2048);
        input.current.focus();
      }
      setMessage(null);
    } catch {
      setMessage("Paste your link into the field using your keyboard.");
      input.current?.focus();
    }
  }
  return (
    <form action="/wishlist/items/new" method="get">
      <label htmlFor="home-product-link" className="text-sm font-bold">
        Paste a product link from any shop
      </label>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-surface border-2 border-outline-strong bg-surface-sunken pl-3.5 pr-1.5 focus-within:bg-surface-raised">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-4 w-4 shrink-0 text-content-muted"
          >
            <path d="m10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l5-5m11 1 2-2a4 4 0 0 1 6 6l-5 5" />
          </svg>
          <input
            ref={input}
            id="home-product-link"
            name="url"
            type="url"
            inputMode="url"
            maxLength={2048}
            placeholder="https://"
            className="h-12 w-full min-w-0 bg-transparent text-base placeholder:text-content-muted"
          />
          <button
            type="button"
            onClick={() => void paste()}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control border border-outline-strong/15 bg-surface-raised px-3 text-sm font-bold hover:border-outline-strong"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-3.5 w-3.5"
            >
              <path d="M9 5H5v16h14V5h-4M9 3h6v4H9Zm0 9h6m-6 4h6" />
            </svg>
            Paste
          </button>
        </div>
        <button
          className="inline-flex h-13 shrink-0 items-center justify-center gap-2 rounded-surface border-2 border-outline-strong bg-action-primary px-5 font-bold shadow-chunk-sm"
          type="submit"
        >
          Add an item <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className="mt-2 text-sm text-content-muted">
        We’ll grab the photo and price. You add a note like size or colour.
      </p>
      {message && (
        <p role="status" className="mt-2 text-sm text-content-secondary">
          {message}
        </p>
      )}
    </form>
  );
}
