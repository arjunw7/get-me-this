import { createGroupHref, startWishlistHref } from "@/src/landing/content";

export const guideIdentity = {
  "/how-it-works": {
    label: "How it works",
    title: "How Get Me This works: wishlists and private gift groups",
    description:
      "Save gift ideas from different shops, share your wishlist with friends, and use private groups when you want to plan gifts together.",
    summary:
      "Add gift ideas, share one link and understand when a private group helps.",
  },
  "/birthday-wishlist": {
    label: "Birthday wishlist",
    title: "Birthday wishlist: share your gift ideas | Get Me This",
    description:
      "Make a birthday wishlist with ideas from different shops. Add sizes, colours and helpful notes, then share one link friends can open without an account.",
    summary:
      "Make a useful birthday list and share it without putting pressure on friends.",
  },
  "/wishlist-from-different-stores": {
    label: "Wishlist from different stores",
    title: "Make a wishlist from different stores | Get Me This",
    description:
      "Save product links from different stores in one wishlist. Check imported details, add helpful notes and share your list with friends.",
    summary:
      "Bring ideas from different shops together, with editable details and one shareable link.",
  },
  "/secret-santa": {
    label: "Secret Santa",
    title: "Secret Santa with wishlists | Get Me This",
    description:
      "Organize Secret Santa with individual wishlists, a group budget and a private name draw. Coordinate gifts while keeping reservations hidden from recipients.",
    summary:
      "Invite your people, draw names privately and keep the gift a surprise.",
  },
} as const;

export type GuidePath = keyof typeof guideIdentity;
export type TopicGuidePath = Exclude<GuidePath, "/how-it-works">;
type GuideSection = {
  title: string;
  paragraphs: readonly string[];
  examples?: readonly string[];
};
type TopicGuide = {
  heading: string;
  intro: string;
  cta: string;
  href: string;
  sections: readonly GuideSection[];
  answers: readonly (readonly [string, string])[];
};

export const topicGuides: Record<TopicGuidePath, TopicGuide> = {
  "/birthday-wishlist": {
    heading: "A birthday wishlist your friends can actually use.",
    intro:
      "When someone asks what you’d like for your birthday, send a few gift ideas in one easy link. Put the things you’d love from different shops in your Get Me This wishlist, with the details that help friends choose.",
    cta: "Create my birthday wishlist",
    href: startWishlistHref,
    sections: [
      {
        title: "Start with a few things you’d love.",
        paragraphs: [
          "Think about things you would enjoy using: a book you keep meaning to read, something for a hobby, or a small upgrade to your everyday routine. You don’t need an endless list or a wishlist full of expensive gifts.",
          "Paste each product link into your wishlist. Check the suggested name, photo, price and currency before saving. If a shop’s information cannot be read, fill in the missing details yourself. Give friends a mix of prices so they can choose what works for them.",
        ],
      },
      {
        title: "The small details make a better gift.",
        paragraphs: [
          "A product link can point to several sizes, colours or versions. Add a short note explaining the one you’d like, whether alternatives are welcome, and anything a friend should check before buying.",
        ],
        examples: [
          "“Blue, size M. Similar styles welcome.”",
          "“Paperback—I’ll take it on my commute.”",
          "“The small one; my shelf is only 30 cm deep.”",
          "“Any roast from this shop. I use a French press.”",
        ],
      },
      {
        title: "Share it when someone asks.",
        paragraphs: [
          "Open Share wishlist and copy your public link, then send it in the conversation you’re already having. Friends can browse your items and notes without creating an account. Signing in is needed if they want to react.",
          "Try a message like: “You asked what I’d like for my birthday, so I put a few ideas here. No pressure at all—I’d love to celebrate together either way.” Add your wishlist link after the message.",
          "Anyone with the active public link can view your profile name, personality line, items and notes. Keep personal details out of those notes. The link does not reveal your email, private groups, gifting assignments or reservations.",
        ],
      },
      {
        title: "One wishlist, even after your birthday.",
        paragraphs: [
          "Your birthday ideas live in your regular wishlist. Edit, remove and reorder them as your taste changes; you don’t need to make a separate list for every occasion. Friends buy from the original shop, which handles payment and delivery. Saved prices are references, so they should check current prices and availability there.",
          "If your friends want to coordinate gifts, create a private group and invite them. Eligible givers can reserve items within that group, while reservations stay hidden from you. Public wishlist links have no reservation controls, and reservations do not coordinate purchases across separate groups.",
        ],
      },
    ],
    answers: [
      [
        "Do I need a group for a birthday wishlist?",
        "No. Your wishlist works on its own. A private group is an optional way to plan gifts together.",
      ],
      [
        "Can friends view it without signing up?",
        "Yes. Anyone with your active public link can browse. Friends sign in to react, and join a group to use its private gifting features.",
      ],
      [
        "Can I add gifts from several shops?",
        "Yes. Save product links from different shops in the same wishlist, checking the details and filling in anything missing.",
      ],
      [
        "Can someone reserve a gift on the public link?",
        "No. Reservations belong to private group contexts and are never shown on public wishlists.",
      ],
    ],
  },
  "/wishlist-from-different-stores": {
    heading: "Different shops. One wishlist.",
    intro:
      "A book from one shop, headphones from another, and something handmade from a third. Keep those gift ideas together in Get Me This instead of sending friends a collection of separate store wishlists.",
    cta: "Create my wishlist",
    href: startWishlistHref,
    sections: [
      {
        title: "Paste a product link, then check the details.",
        paragraphs: [
          "Copy the link to the product you want and open Add an item in your wishlist. Paste the link to request its product information. The app proposes the details it can read; you review them before adding the item.",
          "Check that the name describes the right product, choose the photo friends should see, and confirm the shop, original price and currency. A product page may contain several variants, prices or photos. Your review matters, especially when the link opens a different size or colour by default.",
        ],
      },
      {
        title: "If the shop won’t import, keep going.",
        paragraphs: [
          "Some shops restrict access to their pages or don’t provide complete product information. Extraction can be partial or fail. Get Me This keeps an editable form so you can enter the name, price and other missing details manually.",
          "Keep the original product link with your item so a friend can open the shop and check it. Don’t treat a guessed price or the wrong variant as correct just because it was imported. You can edit the saved item later if you notice a mistake.",
        ],
      },
      {
        title: "Add context, then repeat with another shop.",
        paragraphs: [
          "Use a note for details that don’t fit in the product name: “size M”, “the blue version”, or “something similar is fine”. Choose how much you want it: Really want, Would love, or Just an idea.",
          "Repeat with a link from the next shop. All the items stay in your one persistent wishlist. You can reorder them to put favourites first and remove ideas you no longer want. Adding a new shop does not require a new wishlist or a group.",
        ],
      },
      {
        title: "Share one link. Buy at the original store.",
        paragraphs: [
          "Open Share wishlist and copy your public link. Anyone with that active link can browse your saved items and notes without an account; signed-in friends can react. Private groups and reservations are not shown on this link.",
          "Friends follow the product link to buy at the original retailer. That shop handles payment, stock and delivery. Saved prices are reference information, not live quotes. Original prices and currencies remain available; conversions shown in groups are approximate.",
          "For an occasion where friends want to coordinate, bring the same wishlist into a private group. Eligible members can reserve gifts in that group without revealing the reservation to the recipient.",
        ],
      },
    ],
    answers: [
      [
        "Does every product link import automatically?",
        "No. Shops may restrict access or leave out details. Review the proposed information and use the editable form to complete missing fields.",
      ],
      [
        "Can one wishlist include different currencies?",
        "Yes. Keep each item’s original price and currency. Any group currency conversion is approximate; check the retailer before buying.",
      ],
      [
        "Do friends need an account to browse?",
        "No. They can view your active public wishlist link without signing in. Reacting requires sign-in.",
      ],
      [
        "Does Get Me This handle checkout?",
        "No. Purchases happen at the original retailer, which handles payment, stock and delivery.",
      ],
    ],
  },
  "/secret-santa": {
    heading: "Secret Santa, with gifts they’d actually love.",
    intro:
      "Bring your people into a private Get Me This group. Everyone keeps their own wishlist, each participating member gets one private recipient, and the gift stays a surprise.",
    cta: "Start a Secret Santa group",
    href: createGroupHref,
    sections: [
      {
        title: "1. Set up your group and invite your people.",
        paragraphs: [
          "Create a group, give it a name, and set the occasion, date, budget and currency. Choose Draw names privately as the gifting mode. The organizer participates too. Share the group invitation link to bring your people in.",
          "Ask friends to join and complete their profiles before the draw. Only eligible joined participants are included. Opening a public wishlist link is not the same as joining the group; private gifting features need a signed-in, eligible member.",
        ],
      },
      {
        title: "2. Give everyone a few useful gift ideas.",
        paragraphs: [
          "Each person adds ideas to their own persistent wishlist. Save products from different shops, review imported names, photos and prices, and fill in anything missing. Notes about size, colour or alternatives make choosing easier.",
          "Include ideas around the agreed budget. Saved prices are references and currency conversions are approximate, so the giver should check the original retailer before buying. The same wishlist can be used in other groups and shared separately with friends.",
        ],
      },
      {
        title: "3. Draw names privately.",
        paragraphs: [
          "Once your participants are ready, the organizer runs the draw. Every included participant gets one recipient, and nobody is assigned to themselves. Participants see their own private assignment; being the organizer does not reveal everyone’s assignments.",
          "If someone leaves after the draw, the organizer is alerted. The app does not silently shuffle the assignments. A new draw requires confirmation and replaces the previous draw, so agree on your final participants before running it.",
        ],
      },
      {
        title: "4. Choose a gift and keep the surprise.",
        paragraphs: [
          "Open your assigned recipient’s wishlist in the group and choose something they’d love. Eligible givers can reserve an item so other eligible givers in that group know it is covered. The recipient never sees reservations or purchase progress about themselves.",
          "Reservations apply within the group. A public wishlist link shows no reservation controls or gifting assignments, and a reservation does not prevent purchases in another group. Buy through the original shop’s link; the retailer handles checkout and delivery.",
          "If you want to browse without a draw, choose Share wishlists only when creating a group. Gift everyone is the other supported mode: each participant gets a private checklist of the other participants, with the budget applying per recipient.",
        ],
      },
    ],
    answers: [
      [
        "Can the organizer see who everyone is gifting?",
        "No. Participants see their own private assignment. Organizer access is administrative and does not reveal all assignments.",
      ],
      [
        "Can someone draw their own name?",
        "No. The private draw assigns each eligible participant one other person.",
      ],
      [
        "Can I set couple exclusions or previous-year rules?",
        "Those advanced draw rules are not currently supported. Get Me This provides a private draw among eligible joined participants.",
      ],
      [
        "Can recipients see reserved gifts?",
        "No. Reservations and purchase progress about their own items are hidden from recipients and are never exposed on public wishlist links.",
      ],
    ],
  },
};
