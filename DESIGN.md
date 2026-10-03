# Get Me This design contract

## Authority

The approved visual and interaction reference is **Magic Patterns Version 18**:
https://magicpatterns.com/c/6mqikx9odrcmu2eke7g6bs

The live deployed reference is:
https://project-agile-otter-357.magicpatterns.app/

The prototype communicates layout, hierarchy, responsive intent, component states, copy tone, and interaction behavior. Its generated code is not production architecture. When prototype scaffolding conflicts with this repository's architecture, reproduce the approved experience using the repository's components and data layer.

No implementation may intentionally diverge from an approved screen without documenting the difference and receiving product/design approval.

The deployed URL is the easiest live comparison surface, but it is mutable. Committed golden screenshots captured from the approved Version 18 deployment are the immutable authority if the deployed prototype later changes. A newer prototype becomes authoritative only after explicit approval and a reviewed baseline update.

## Product comprehension

A first-time visitor should understand within five seconds that Get Me This is a group-wishlist product.

Primary language:

- Category: **Group wishlists for every occasion.**
- Hero: **Make a wishlist. Share it with your people.**
- Value: **Save what you want, share it with your people, and give without guessing.**
- Supporting personality: **Your friends can finally take the hint.**

Use familiar terms:

- `wishlist`, never `Shelfie`
- `group`, never `Circle`
- `Add an item`
- `Start my wishlist`
- `Create a group`
- `Update my wishlist`

## Personality

The brand is the user's funniest friend who is surprisingly organized: warm, expressive, lightly chaotic, culturally aware, and helpful without sounding like productivity software.

India-born and globally usable means cultural specificity comes through occasions, names, products, currencies, and stories—not stereotypical motifs.

Humor may add personality around an action but may not replace a clear label or obscure consequences.

## Visual system

- Warm off-white page background
- Near-black primary text and outlines
- Punchy coral/tomato primary action colour
- Marigold, electric blue, and acid-lime supporting accents
- Bold grotesque display typography with a highly readable sans-serif body
- Large product imagery
- Chunky rounded cards, dark outlines, and offset shadows
- Restrained tape, doodle, sticker, and wobble details
- One dominant accent per screen
- Useful motion only: brief presses, pops, reveals, and card transitions; respect reduced-motion preferences

Exact colour, typography, radius, shadow, spacing, and motion values must be extracted from the final prototype during the foundation slice and expressed as semantic tokens. Avoid scattered raw hex values and arbitrary pixel utilities.

## Saved profile Vibe

The user-approved profile extension adds **Vibe** to profile creation and Edit profile. Label the color picker **Choose your Vibe** in both creation and editing. Offer four labeled radio swatches: Tomato, Marigold, Electric, and Acid lime. Marigold is the default for new profiles and existing accounts without a prior choice.

Use the semantic tokens `bg-action-primary`, `bg-accent-highlight`, `bg-accent-info`, and `bg-accent-fresh` respectively. Electric uses light foreground text; the other three use the dark primary foreground. Show the selected swatch with a check mark and visible focus treatment so selection never depends on color alone.

The saved choice drives the person’s wishlist and profile accents wherever their profile is authorized to appear. Group members see that person’s selected Vibe, not a new color assigned by the viewer. Vibe changes presentation only; it does not change membership, gifting, or reservation permissions. This approved extension does not authorize replacing frozen visual baselines automatically.

## Interaction principles

- Mobile-first, with touch targets of at least 44 by 44 CSS pixels.
- Keyboard focus is always visible.
- Form fields have persistent labels; placeholders are examples, not labels.
- Loading, empty, success, and failure states are designed, not left to browser defaults.
- Destructive or surprising actions require confirmation.
- Private information explains who can and cannot see it.
- Horizontal product rows settle aligned with the page gutter after scrolling.

## Reactions

The approved reaction UI follows a familiar social-post model, not rubber stamps or chips.

- One reaction per user per item.
- Choices: `Very you`, `Questionable`, and `Want it too`.
- The full second phrase is `questionable, but supported`.
- Selecting another reaction replaces the current one.
- Selecting the active reaction removes it.
- Friends' items show an interactive summary and action row.
- The user's own items show a read-only reaction summary and breakdown.
- No reactions: `Be the first to react` for friends' items and `No reactions yet` for one's own item.

## Responsive application shell

- Desktop: persistent application navigation with the account trigger at the bottom.
- Mobile: slim top bar with wordmark and account avatar, plus bottom navigation for primary destinations.
- The account menu exposes email, My wishlist, Edit profile, and Log out.
- Log out requires confirmation and returns to the landing page with a short success message.

## Visual verification

Every implemented reference screen must have stable Playwright screenshots at minimum:

- Mobile: 390 by 844
- Desktop: 1440 by 1000 or the closest agreed stable viewport

Use deterministic seed data, local/stable images, fixed fonts, disabled time variance, and consistent browser versions. Screenshot diffs require human review; agents may not approve their own baseline changes.

For each review, compare the production implementation and the deployed prototype using the same viewport, route-equivalent state, fixture content, scroll position, and open overlays. Review both the screenshot diff and the rendered interaction; pixel similarity alone does not prove correct behavior or accessibility.

## Approved interaction refinements — 2026-10-04

The user approved these changes beyond the frozen prototype's native controls:

- A prominent organizer-only Invite people action in the group header, leading to the existing invitation manager. Member avatar hover/focus must fit within the horizontal roster's padded clipping bounds.
- A branded date popover using the page's cream, ink, rounded outlines, accent selection, and offset shadow. Keep typed ISO date entry and keyboard calendar navigation.
- Styled searchable currency choices, matched by code or full name, with room around the chevron. Group creation retains its approved four-currency set; item forms retain their supported currency set.
- Explicit hover, focus, and pointer feedback on Edit profile.
- Wishlist reorder handles without visible up/down buttons. Pointer/touch dragging and keyboard pickup/move/drop/cancel must persist through the existing order-write contract. Drag feedback must not shift list geometry.

These are user-requested design extensions. Existing visual baselines are not silently regenerated to accept them.
