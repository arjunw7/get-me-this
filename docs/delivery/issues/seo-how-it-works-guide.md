# SEO: public wishlist and Secret Santa guides

Owner-approved continuation: 4 October 2026. Initially the how-it-works guide; explicitly extended by the owner to the remaining birthday, cross-store and Secret Santa pages and visible homepage references. One bounded educational-content slice in PR #83.

## Acceptance criteria

- Explain saving a product, checking editable details, sharing an anonymous-view link and purchasing at the original retailer.
- Explain standalone wishlist use before optional private groups and the three supported gifting modes.
- Add /birthday-wishlist with useful item-note and sharing-etiquette examples; /wishlist-from-different-stores with review/manual fallback guidance; /secret-santa with accurate organizer/participant steps and private draw behavior.
- Distinguish signed-in reactions from guest viewing, group-scoped reservations and recipient privacy. Do not promise universal extraction, live prices, global duplicate prevention, advanced draw exclusions or in-app checkout.
- Server-render all explanations without requiring JavaScript or authentication. Add a visible Helpful guides section on the homepage and related-guide links on all four guides.
- Give each guide a unique canonical, description, social metadata, WebPage and visible BreadcrumbList identity. Explicitly add only the homepage and four guides to the sitemap/indexing allowlist.
- Fail closed for previews and disabled indexing; private, personal and unknown paths remain excluded.
- Use existing typography, semantic tokens and CTA components. Verify desktop/mobile, keyboard controls, overflow and accessibility. Preserve existing visual baselines pending owner design review.
- Run pnpm verify and relevant browser/SEO checks; record before/after evidence and independent review. Update the reviewable draft PR without publishing this new design automatically.

## Scope boundaries

No database, auth, extraction, production configuration, dependencies or homepage positioning redesign. About/contact/policies, walkthrough videos, external distribution and Search Console/Bing setup remain later work. The homepage addition is navigation to the educational guides; previously approved hero, illustrations and FAQ/occasion borders are preserved.

## Evidence

Initial guide: docs/delivery/evidence/how-it-works-seo-2026-10-04/README.md.
Expanded guide slice: docs/delivery/evidence/search-guides-2026-10-04/README.md.
Owner reviewed and explicitly approved the desktop/mobile homepage changes; exactly those two Ubuntu CI baselines are adopted with recorded hashes. New exact-head CI and deployment remain pending.
