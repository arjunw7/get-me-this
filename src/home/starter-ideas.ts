/** Editorial prompts, not products or saved wishlist fixtures. */
export const STARTER_IDEAS = [
  {
    id: "desk",
    label: "Something for your desk",
    prompt: "The thing that would make 9am slightly less bleak.",
    note: "For my desk.",
    tone: "bg-accent-fresh",
  },
  {
    id: "luxury",
    label: "A tiny luxury",
    prompt: "Small, a bit extra, and you’d never buy it for yourself.",
    note: "A tiny luxury I keep talking myself out of.",
    tone: "bg-accent-highlight",
  },
  {
    id: "cart",
    label: "That thing in your cart for 3 weeks",
    prompt: "You know the one. Grab the link from your cart.",
    note: "Been sitting in my cart for weeks.",
    tone: "bg-accent-info",
  },
  {
    id: "upgrade",
    label: "An upgrade to something you use daily",
    prompt: "Your bottle, bag, headphones. The better version.",
    note: "An upgrade to one I use every day.",
    tone: "bg-action-primary",
  },
  {
    id: "experience",
    label: "A class or experience",
    prompt: "Pottery, a gig, a cooking class. Paste the booking page.",
    note: "Would love to try this.",
    tone: "bg-surface-sunken",
  },
] as const;

export function getStarterIdea(value: unknown) {
  return typeof value === "string"
    ? (STARTER_IDEAS.find((idea) => idea.id === value) ?? null)
    : null;
}
