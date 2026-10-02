# Version 1 scope

## P0 — required to launch

### Identity and account

- Unified email authentication with a six-digit OTP and magic link in the same email.
- New and returning users use the same entry screen.
- Minimal onboarding: display name and optional avatar.
- Session restoration, protected application routes, account menu, and confirmed logout.

### Wishlist

- One persistent wishlist per user.
- Add, edit, delete, and reorder items.
- Link import for HTTP/HTTPS products with title, retailer, images, price, and currency extraction.
- Editable extraction results and complete manual-entry fallback.
- Personal note and desire level.
- Original price/currency and approximate group-currency display where available.
- External retailer link.

### Groups

- Create group with name, occasion, date, location/description if provided, budget, currency, and gifting mode.
- Invite-only membership using a shareable link.
- Signed-out invitation preview and intent-preserving authentication.
- Organizer and membership states.
- Browse all joined members' wishlists.

### Gifting

- Draw names privately.
- Gift everyone checklist.
- Share wishlists only mode.
- Private, group-scoped gift reservations.
- Reserved-by-another state visible to eligible gift givers but never the recipient.
- External purchase flow; no in-app checkout.

### Social expression

- One visible reaction per user per eligible item: Very you, Questionable, or Want it too.
- Switch or remove a reaction.
- Read-only reaction summaries on one's own wishlist.
- Copy an eligible item into one's own wishlist.

### Communication

- Branded authentication email through Resend/Supabase.
- Transactional group invitation and assignment/reminder emails where required for the core flow.

## P1 — fast follow

- Richer reminder preferences.
- Archived/completed group management.
- Better retailer-specific extraction adapters.
- Currency-rate freshness indicators and manual refresh.
- Account deletion and data export UX beyond the minimum compliant path.
- Improved organizer recovery when a member leaves after a draw.
- Optional installable PWA polish.

## P2 — future considerations

- Browser extension or share sheet.
- Affiliate infrastructure.
- Advanced draw exclusions and previous-year history.
- Anonymous questions to recipients.
- Gift recommendations.
- Public profiles, discovery, or following.
- Native mobile applications.

## Explicit non-goals for v1

- No public social feed or follower graph.
- No full chat or comments.
- No AI gift recommendations.
- No in-app checkout, payments, pooled funds, shipping, or delivery tracking.
- No retailer inventory guarantees.
- No Google, Apple, phone, or password authentication.
- No advanced draw exclusions.
- No requirement for CAPTCHA in the design; abuse protection is production implementation work.
- No microservice architecture.

Any addition to P0 requires removing comparable scope or explicitly extending the launch plan.


<!-- CI triage live test: this line exercises the docs-only skip path. -->
