/** Public landing copy approved in the 4 October 2026 positioning review. */
export const landingNav = [
  { label: "How it works", href: "#how" },
  { label: "Gifting with a group", href: "#groups" },
] as const;
export const loginHref = "/auth?intent=home";
export const dashboardHref = "/home";
export const dashboardLabel = "Dashboard";
export const startWishlistHref = "/auth?intent=wishlist";
export const createGroupHref = "/auth?intent=create-group";
export const hero = {
  eyebrow: "Your shareable gift wishlist",
  title: "Good gifts start with a wishlist.",
  body: "Save gift ideas from different stores in one wishlist. Share it with friends so they know what you’d love to get.",
  primaryCta: "Create my wishlist",
  secondaryCta: "How it works",
  privacyNote:
    "No group needed. Friends can view your list without signing up.",
} as const;
export const howItWorks = {
  title: "Your wishlist. One link. Happy friends.",
  steps: [
    {
      title: "Add what you’d love",
      body: "Save product links from different stores. Add helpful details like size, colour, or why you want it.",
    },
    {
      title: "Share your wishlist",
      body: "Send one link to friends. They can browse without creating an account.",
    },
    {
      title: "Make gifting easier",
      body: "Friends pick something you like and buy it from the original store.",
    },
  ],
} as const;
export const groupCopy = {
  title: "Gifting together? Start a group.",
  body: "A group brings your friends’ individual wishlists into one private place. See what everyone wants and coordinate gifts without spoiling the surprise.",
  benefits: [
    {
      title: "Your wishlist comes with you",
      body: "Everyone keeps their own wishlist. No new list to build.",
    },
    {
      title: "Let friends know it’s covered",
      body: "Reserve a gift so other people in the group know someone is getting it.",
    },
    {
      title: "Keep the surprise",
      body: "The person receiving it never sees the reservation.",
    },
  ],
} as const;
export const faqs = [
  {
    question: "Do I need a group to use my wishlist?",
    answer:
      "No. Create your wishlist and share its link. Groups are optional and help friends coordinate gifts together.",
  },
  {
    question: "Do my friends need an account?",
    answer:
      "They can view your public wishlist without one. They need to sign in to react or join a group.",
  },
  {
    question: "Who can see my wishlist?",
    answer:
      "Anyone with your public link can view it. Your group’s reservations and gifting plans are private and don’t appear on the public page.",
  },
  {
    question: "Where are gifts purchased?",
    answer:
      "At the original store. Get Me This helps you share ideas and coordinate gifts; it doesn’t process the purchase.",
  },
] as const;
export const finalCta = {
  title: "Next time they ask what you want, send your wishlist.",
  body: "Less guessing. More “you remembered!”",
  cta: "Create my wishlist",
} as const;
export const footer = {
  tagline: "Your wishlist. Your people. Better gifts.",
} as const;
