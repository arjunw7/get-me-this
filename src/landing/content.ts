/**
 * Static marketing copy for the landing page, transcribed from the frozen
 * V18 reference (data/landing.ts, Landing.tsx, GroupDemoSection.tsx).
 *
 * Terminology rules apply: `wishlist` and `group`, never the prototype's
 * internal nouns.
 */
export const landingNav = [
  { label: "How it works", href: "#how" },
  { label: "Why it works", href: "#why" },
  { label: "Occasions", href: "#occasions" },
] as const;

export const loginHref = "/auth?intent=home";
export const dashboardHref = "/home";
export const dashboardLabel = "Dashboard";
export const startWishlistHref = "/auth?intent=wishlist";
export const createGroupHref = "/auth?intent=create-group";

export const hero = {
  eyebrow: "Group wishlists for every occasion.",
  title: "Make a wishlist. Share it with your\u00A0people.",
  body: "Save things you actually want from any store. Create a group for birthdays, Diwali, Secret Santa, or anything worth celebrating. Friends can reserve gifts privately—so surprises stay secret and nobody buys the same thing twice.",
  primaryCta: "Start my wishlist",
  secondaryCta: "Create a group",
  privacyNote:
    "Private by default. Only people in your groups can see your wishlist.",
} as const;

export const howItWorks = {
  title: "How it works",
  steps: [
    {
      title: "Make your wishlist",
      body: "Save products from any shop and add helpful notes, like a size or “the blue one, not the green.”",
    },
    {
      title: "Create a group",
      body: "Invite friends, then choose the occasion, budget, currency and gifting mode.",
    },
    {
      title: "Gift without guessing",
      body: "Browse wishlists and reserve gifts privately, so nobody spoils the surprise or buys the same thing twice.",
    },
  ],
} as const;

export const whyItWorks = {
  title: "Everyone’s wishlist in one place. No double gifts.",
  body: "Here’s what a group looks like once your friends are in.",
  benefits: [
    {
      title: "See what everyone actually wants",
      body: "Each person’s wishlist, with notes like size or colour.",
    },
    {
      title: "Stay inside the budget",
      body: "One amount per person. Pricier picks are flagged.",
    },
    {
      title: "Reserve it so nobody doubles up",
      body: "Everyone else sees it’s taken and picks something else.",
    },
    {
      title: "The surprise stays secret",
      body: "Kabir never sees what’s reserved on his own list.",
    },
  ],
} as const;

export type OccasionTile = {
  readonly label: string;
  readonly example: string;
  /** Semantic accent used for the tile fill, one dominant accent per screen. */
  readonly tone: "coral" | "electric" | "lime" | "marigold" | "paper";
};

export const occasions: readonly OccasionTile[] = [
  { label: "Diwali", example: "Diwali Scenes", tone: "marigold" },
  { label: "Eid", example: "Eid at Nani's", tone: "lime" },
  { label: "Birthdays", example: "Rohan turns 27", tone: "coral" },
  { label: "Weddings", example: "Meera & Arjun, finally", tone: "paper" },
  { label: "Housewarming", example: "New flat, who dis", tone: "electric" },
  { label: "Secret Santa", example: "Studio 4B Santa", tone: "paper" },
  { label: "Just because", example: "Galentine’s, but July", tone: "coral" },
];

/** Tile rotation rhythm from the reference; indexes repeat cyclically. */
export const occasionTilts = [
  "-rotate-2",
  "rotate-1",
  "-rotate-1",
  "rotate-2",
  "rotate-0",
  "-rotate-2",
  "rotate-1",
] as const;

export const finalCta = {
  title: "Your friends can finally take the hint.",
  body: "Save what you want, share it with your people, and give without guessing.",
  cta: "Start my wishlist",
} as const;

export const footer = {
  tagline:
    "Group wishlists for every occasion. No public feeds, no followers, just your people.",
} as const;
