import Link from "next/link";

/** V18 Add Item is a standalone flow, outside the main application shell. */
export function AddItemHeader() {
  return (
    <header className="border-b-2 border-outline-strong bg-surface-page">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
        <span className="font-display text-lg font-bold">Add an item</span>
        <Link
          href="/wishlist"
          aria-label="Close and return to your wishlist"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-outline-strong bg-surface-raised"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="m18 6-12 12M6 6l12 12" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
