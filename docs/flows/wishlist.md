# Wishlist flow

## Model

Each user owns one persistent wishlist reused across every group. Groups grant visibility to the current wishlist rather than cloning it.

The profile’s saved **Vibe** colors its wishlist and profile accents. The owner selects Tomato, Marigold, Electric, or Acid lime during profile creation or Edit profile; Marigold is the default. Authorized joined members see the same saved Vibe. They cannot edit it, and Vibe exposes no reservation or private gifting information.

## Add from link

1. User pastes an HTTP/HTTPS product URL.
2. The server validates and fetches the page under strict network and size limits.
3. The extractor proposes title, retailer, images, original price, and currency.
4. User chooses an image, edits any field, adds a note and desire level, then saves.
5. If extraction is incomplete or fails, the same form remains available for manual completion.

### Extraction safety

- Allow HTTP and HTTPS only; upgrade/prefer HTTPS where appropriate.
- Block localhost, private/link-local IP ranges, credential-bearing URLs, and unsupported ports.
- Resolve and revalidate every redirect.
- Apply time, response-size, and redirect-count limits.
- Accept expected HTML/image content types only.
- Sanitize extracted text and never execute remote scripts.
- Store the source URL and selected product snapshot; never depend on the retailer remaining available.

## Item fields

- Title
- Source URL
- Retailer/domain
- Selected image and optional candidate images
- Original price and currency
- Optional approximate converted price metadata
- Personal note
- Desire level: Really want, Would love, or Just an idea
- Sort position
- Created/updated timestamps

## Item behavior

- Owner can create, edit, reorder, and delete.
- Other eligible users can view, react, copy, reserve, or follow the retailer link.
- Copying creates an independent item owned by the copying user and records provenance without sharing later edits.
- Reservations are scoped to the viewing group, not globally across every group containing the owner.
- The owner never receives reservation or purchasing information about their own items.

## Price behavior

- Preserve the original amount and currency.
- Label converted amounts approximate and store the rate source/time when generated.
- If conversion is unavailable, show the original price without blocking the item.
- Group budgets are guidance; items over budget remain visible.

## Empty and failure states

- Empty owner wishlist encourages the first item and includes sharing. A public empty wishlist shows a friendly empty state without owner editing controls.
- Broken/deleted retailer page continues showing saved metadata and marks the source as unavailable only after verified failure.
- Missing image uses a branded placeholder.
- Failed extraction never discards the pasted URL or user-entered data.

## Share wishlist

Every wishlist starts with an active public link. The owner opens Share wishlist beside Edit profile. The sheet shows a selectable URL, an accessible external-link icon at its right edge that opens the same URL in a new tab, and Copy link. It has no Stop sharing control or separate Open public wishlist CTA. Clipboard failures keep the selectable link visible without claiming success. Backend revocation remains supported and invalidates the link for subsequent reads, image fetches, and reactions; it is not exposed as an action in this sheet. An already disabled link can be re-enabled with a fresh URL. Already downloaded or copied content cannot be recalled.

The public route shows the saved profile Vibe, name, personality line, item information, and public reaction counts only. No group data or gifting state is read by this route. Visitors sign in to react; existing and new accounts return to the shared wishlist after authentication/onboarding, then explicitly choose a reaction. The owner sees reaction summaries without reacting to their own items. Public and group reactions are separate contexts; the owner’s private wishlist combines their counts.

## Reordering interaction

Choose Reorder, then drag an item's handle into its new position. No visible up/down buttons are required. Keyboard users focus a handle, press Space or Enter to pick it up, use arrow keys or Home/End to move it, and press Space or Enter to drop; Escape cancels without saving. Touch handles support pointer movement and edge scrolling. Saving, stale-order refresh, authorization failure, and recovery continue through the existing compare-and-swap order boundary; Done waits for pending work. Announcements and saving feedback must not move the rows while dragging.

### First-use Home sharing progress

Home presents three steps while the owner has no groups: add items, share the wishlist using the existing public-link sheet, and create a group for the next occasion. Opening the sheet, enabling sharing or a failed copy does not complete the sharing step. A successful clipboard copy or activating WhatsApp sharing marks it done; WhatsApp completion records the handoff, not delivery to another person. Progress is a browser-local onboarding hint scoped to the owner's wishlist ID, containing only `done`, never a share token or URL. It survives reloads in that browser; unavailable browser storage retains progress only for the current visit. It never grants access, changes public-sharing authorization, or represents a server-side audit of sharing.
