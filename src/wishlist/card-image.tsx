"use client";

import { useState } from "react";

/**
 * The wishlist card's image field (005b): the only client interactivity on
 * the server-rendered list (besides the shell's menu). An item whose image
 * URL fails at runtime — broken or deleted retailer image — degrades to
 * the branded placeholder, never a broken-image icon, blank gap, or
 * browser default (the flow rule). Items with no image URL render the
 * placeholder directly; the runtime fallback exists only for items whose
 * URL stopped resolving.
 */
export function CardImage({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <PlaceholderArt title={title} />;
  }
  return (
    // A plain <img> is deliberate: retailer image URLs are arbitrary remote
    // hosts (no domain allowlist exists to configure next/image), and the
    // branded placeholder below must control every failure mode.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title}
      loading="lazy"
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * The branded missing-image placeholder (005b): the item's title set in
 * display type on the cream field, at the V18 placeholder scale. Rendered
 * for items with no image URL, snapshot-path-only items, and images that
 * fail at runtime.
 *
 * The art is a decorative echo of the title that is already announced by
 * the card's heading, so it is hidden from the accessibility tree. Its
 * tone is text-content-primary/55 rather than V18's faint ink-at-25%:
 * the fainter prototype tone fails WCAG 2 AA large-text contrast on the
 * sunken field (1.71:1 vs the required 3:1), and production accessibility
 * takes precedence over prototype shortcuts (round-3 review decision,
 * 2026-09-30). Contrast now ≈3.6:1.
 */
export function PlaceholderArt({ title }: { title: string }) {
  return (
    <span
      data-testid="wishlist-image-placeholder"
      aria-hidden="true"
      className="flex h-full w-full items-center justify-center p-6 text-center font-display text-2xl font-extrabold text-content-primary/55"
    >
      {title}
    </span>
  );
}
