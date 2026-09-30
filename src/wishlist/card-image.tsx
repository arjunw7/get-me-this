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
 */
export function PlaceholderArt({ title }: { title: string }) {
  return (
    <span
      data-testid="wishlist-image-placeholder"
      className="flex h-full w-full items-center justify-center p-6 text-center font-display text-2xl font-extrabold text-content-primary/25"
    >
      {title}
    </span>
  );
}
