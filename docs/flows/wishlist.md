# Wishlist flow

## Model

Each user owns one persistent wishlist reused across every group. Groups grant visibility to the current wishlist rather than cloning it.

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

- Empty wishlist encourages the first item without implying public visibility.
- Broken/deleted retailer page continues showing saved metadata and marks the source as unavailable only after verified failure.
- Missing image uses a branded placeholder.
- Failed extraction never discards the pasted URL or user-entered data.

