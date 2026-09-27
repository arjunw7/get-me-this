import type { AvatarPerson } from "./avatar";

/**
 * DETERMINISTIC DEMONSTRATION CONTENT — not real product data.
 *
 * These people, products, prices, and the demo group exist only to render
 * the approved landing demonstration sections and the auth collage. They
 * are transcribed from the frozen V18 reference fixture so screenshots
 * compare apple to apple against `docs/design-reference/baselines/v18/`.
 *
 * Rules:
 * - Fixed strings only: no dates, randomness, or computed currency
 *   conversion. Price strings are the exact approved renderings; real
 *   currency logic arrives with the wishlist product slice.
 * - Terminology: `wishlist` and `group`, never the prototype's internal
 *   nouns.
 * - Nothing here is ever a data source for real features.
 */

export const demoPeople = {
  aanya: {
    name: "Aanya Mehta",
    initials: "AM",
    accent: "coral",
    status: "joined",
  },
  kabir: {
    name: "Kabir Khanna",
    initials: "KK",
    accent: "electric",
    status: "joined",
  },
  zoya: {
    name: "Zoya Sheikh",
    initials: "ZS",
    accent: "marigold",
    status: "joined",
  },
  rohan: {
    name: "Rohan Iyer",
    initials: "RI",
    accent: "lime",
    status: "joined",
  },
  sam: {
    name: "Sam Okafor",
    initials: "SO",
    accent: "ink",
    status: "joined",
  },
  meera: {
    name: "Meera Pillai",
    initials: "MP",
    accent: "marigold",
    status: "pending",
  },
  dev: {
    name: "Dev Arora",
    initials: "DA",
    accent: "lime",
    status: "pending",
  },
} as const satisfies Record<string, AvatarPerson>;

export type DemoProductId =
  | "a-matcha"
  | "k-kettle"
  | "z-camera"
  | "k-vinyl"
  | "k-bonsai"
  | "z-claws"
  | "r-cups";

export type DemoProduct = {
  readonly id: DemoProductId;
  readonly title: string;
  /** Owner's demo person id. */
  readonly ownerId: "aanya" | "kabir" | "rohan" | "zoya";
  /** Exact approved price rendering; no conversion is computed here. */
  readonly priceDisplay: string;
  /** Local vendored asset under /assets/landing. */
  readonly image: string;
};

export const demoProducts: Record<DemoProductId, DemoProduct> = {
  "a-matcha": {
    id: "a-matcha",
    title: "Speckled ceramic matcha set",
    ownerId: "aanya",
    priceDisplay: "₹2,450",
    image: "/assets/landing/a-matcha.jpg",
  },
  "k-kettle": {
    id: "k-kettle",
    title: "Matte black gooseneck kettle",
    ownerId: "kabir",
    priceDisplay: "₹2,350",
    image: "/assets/landing/k-kettle.jpg",
  },
  "z-camera": {
    id: "z-camera",
    title: "Half-frame film camera",
    ownerId: "zoya",
    priceDisplay: "₹4,299",
    image: "/assets/landing/z-camera.jpg",
  },
  "k-vinyl": {
    id: "k-vinyl",
    title: "Blue colour-vinyl pressing",
    ownerId: "kabir",
    priceDisplay: "₹1,899",
    image: "/assets/landing/k-vinyl.jpg",
  },
  "k-bonsai": {
    id: "k-bonsai",
    title: "Brick-build bonsai tree",
    ownerId: "kabir",
    priceDisplay: "₹3,999",
    image: "/assets/landing/k-bonsai.jpg",
  },
  "z-claws": {
    id: "z-claws",
    title: "Acetate claw clip set",
    ownerId: "zoya",
    priceDisplay: "$22 · ≈ ₹1,850",
    image: "/assets/landing/z-claws.jpg",
  },
  "r-cups": {
    id: "r-cups",
    title: "Glazed espresso cup pair",
    ownerId: "rohan",
    priceDisplay: "₹1,950",
    image: "/assets/landing/r-cups.jpg",
  },
};

export const demoGroup = {
  name: "Santa Party 🎉",
  meta: "Sat, 7 Nov · 5 friends",
  budgetDisplay: "₹2,500 each",
  // The figure's accessible name must match its visible name.
  ariaLabel: "Santa Party 🎉",
} as const;

export const heroBubbles = [
  { personId: "zoya", text: "very you" },
  { personId: "rohan", text: "questionable, but supported" },
  { personId: "sam", text: "I want this too" },
] as const;
