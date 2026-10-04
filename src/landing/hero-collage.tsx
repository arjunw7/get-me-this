/* eslint-disable @next/next/no-img-element -- local deterministic demo
   assets served from public/; next/image optimization would re-encode the
   pixels the visual baselines must match byte for byte. */

import type { CSSProperties } from "react";

import { Avatar } from "./avatar";
import { demoPeople, demoProducts, heroBubbles } from "./demo-data";
import { Tape } from "./tape";

/**
 * Decorative hero collage, ported from the frozen V18 reference
 * (components/landing/HeroCollage.tsx).
 *
 * The original reservation sticker is omitted: public wishlist links never
 * show reservation information. Group coordination is explained separately.
 *
 * Entirely decorative (aria-hidden): the marketing copy next to it carries
 * the meaning. Entrance motion is CSS (.landing-reveal) with per-card
 * delays matching the reference rhythm.
 *
 * Colour, type, radius, and shadow values are tokens. The absolute
 * positions and sizes below are the frozen reference's collage geometry:
 * one-off decorative composition, transcribed verbatim so screenshots
 * compare apple to apple.
 */

const CARDS = [
  {
    productId: "a-matcha",
    pos: "left-0 top-10 -rotate-6",
    delay: 0,
    tape: false,
  },
  {
    productId: "k-kettle",
    pos: "left-[30%] top-0 rotate-3 z-10",
    delay: 60,
    tape: true,
  },
  {
    productId: "z-camera",
    pos: "right-0 top-32 -rotate-2",
    delay: 120,
    tape: false,
  },
] as const;

const BUBBLES = [
  { ...heroBubbles[0], pos: "left-1 top-[250px] sm:top-[280px]", delay: 260 },
  {
    ...heroBubbles[1],
    pos: "left-[18%] top-[345px] sm:left-[28%] sm:top-[370px]",
    delay: 320,
  },
  { ...heroBubbles[2], pos: "right-2 top-[400px] sm:top-[440px]", delay: 380 },
] as const;

function reveal(delay: number): { style: CSSProperties } {
  return {
    style: { "--reveal-delay": `${delay}ms` } as CSSProperties,
  };
}

export function HeroCollage() {
  return (
    <div
      className="relative mx-auto h-[470px] w-full max-w-[520px] sm:h-[520px]"
      aria-hidden="true"
    >
      {CARDS.map(({ productId, pos, delay, tape }) => {
        const product = demoProducts[productId];
        const owner = demoPeople[product.ownerId];
        return (
          <div
            key={product.id}
            {...reveal(delay)}
            className={`landing-reveal absolute w-[46%] max-w-[220px] ${pos}`}
          >
            <div className="relative">
              {tape ? (
                <Tape className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rotate-2" />
              ) : null}
              <div className="overflow-hidden rounded-surface-lg border-2 border-outline-strong bg-surface-raised shadow-chunk">
                <div className="flex items-center gap-2 border-b-2 border-outline-strong px-3 py-2">
                  <Avatar person={owner} size="xs" />
                  <span className="truncate text-xs font-bold">
                    {owner.name.split(" ")[0]}&rsquo;s wishlist
                  </span>
                </div>
                <div className="relative aspect-square bg-surface-sunken">
                  <img
                    src={product.image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <p className="font-display text-sm leading-tight font-bold">
                    {product.title}
                  </p>
                  <p className="mt-1 text-xs">
                    <span className="font-bold tabular-nums">
                      {product.priceDisplay}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {BUBBLES.map(({ personId, text, pos, delay }) => {
        const person = demoPeople[personId];
        return (
          <div
            key={personId}
            {...reveal(delay)}
            className={`landing-reveal absolute z-20 inline-flex items-center gap-2 rounded-full rounded-bl-md border-2 border-outline-strong bg-surface-page py-1 pr-3 pl-1 shadow-chunk-sm ${pos}`}
          >
            <Avatar person={person} size="xs" />
            <span className="text-sm font-semibold whitespace-nowrap">
              &ldquo;{text}&rdquo;
            </span>
          </div>
        );
      })}
    </div>
  );
}
