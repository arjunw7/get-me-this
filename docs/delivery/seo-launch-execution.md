# SEO and AI discovery launch execution

Owner-approved start: 4 October 2026. Canonical domain: https://getmethis.fun.
This is a sequenced launch backlog; unchecked tasks are not claimed complete.
The first bounded implementation is technical SEO. Content and distribution are
separate slices so the approved landing and private data model remain stable.

## Slice 1: technical SEO acceptance criteria

- [x] Homepage canonical and Open Graph URL use https://getmethis.fun/ even on query variants.
- [x] Root metadata defaults to noindex/nofollow. Only reviewed marketing pages opt in.
- [x] The final proxy response (including early auth redirects) noindexes all non-marketing routes, noncanonical hosts and non-launch deployments.
- [x] Production indexing requires SEO_INDEXING_ENABLED=true and APP_ORIGIN=https://getmethis.fun. Railway PR numbers and non-production environment names veto it.
- [x] Runtime robots.txt and sitemap.xml exist. The sitemap contains only reviewed marketing routes; it is empty when indexing is disabled.
- [x] Crawlers can fetch utility pages to read their noindex instructions. Authentication/RLS still protect application data. Public bearer wishlists remain noindex/nofollow; they never enter the sitemap or schema.
- [x] Separate search and training policies: search retrieval allowed, GPTBot/ClaudeBot training disallowed, Google-Extended permitted only on reviewed marketing pages on the launch deployment. Google-Extended covers Gemini grounding AND training, not Google Search ranking.
- [x] Homepage JSON-LD describes WebSite and WebApplication only; no invented prices, reviews, ratings, legal organization details or merchant product offers.
- [x] Full local verification and rendered-response evidence recorded before PR completion. See `evidence/seo-foundation-2026-10-04/README.md`.
- [ ] Exact-head GitHub CI passed after push.
- [ ] Human-reviewed deployment and live domain checks complete.

## Production activation runbook (deployment owner)

No production settings are changed by this implementation.

1. Finish valid HTTPS for getmethis.fun. If www is used, provision its certificate
   and add a one-hop permanent redirect to the canonical host, preserving paths
   and queries. DNS aliases alone do not perform an HTTP redirect.
2. Set APP_ORIGIN=https://getmethis.fun and SEO_INDEXING_ENABLED=true at build AND
   runtime only for the launch deployment. Railway environment name must be
   production. Leave SEO_INDEXING_ENABLED=false on previews/staging; do not copy
   a production activation flag into another platform's previews.
3. Deploy the reviewed branch after its prerequisite PRs. Inspect raw HTML for
   homepage canonical, robots metadata, social image URL, and valid JSON-LD.
4. Confirm launch / returns 200 without X-Robots-Tag:noindex. Confirm /auth,
   /invite/unavailable, /s/invalid and /design-foundation remain noindex. Unknown
   share links still return404. Protected routes still require authentication.
5. Confirm /robots.txt and /sitemap.xml return200; sitemap currently has exactly
   the homepage. No personal URLs, guessed future pages or changing fake dates.
6. Inspect a PR preview independently: homepage and utility responses must have
   noindex and its sitemap must have no loc entries. Robots intentionally allows
   fetches so noindex can be observed. Access protection is recommended for any
   sensitive preview; neither robots nor noindex is an authorization boundary.
7. Verify domain ownership in Google Search Console and Bing Webmaster Tools;
   submit the sitemap and inspect homepage eligibility. Their verification codes
   are account-specific and must be obtained through the owner's accounts.

Rollback: set SEO_INDEXING_ENABLED=false to disable page indexing and empty the
sitemap; redeploy/rebuild when configuration changes. Removal from existing search
indexes is not immediate. Reverting code requires no schema rollback. There are
no migrations, new dependencies, data-access changes or visual baseline changes.

## Slice 2: two-day discovery research

- [ ] Compare ~40 realistic queries in India and one separately recorded intended
      international market. Log date, locale, query, result URLs, source type, product
      fit, and evidence quality. Do not infer search volumes from result counts.
- [ ] Run a fixed set of20 unbranded questions with web search in ChatGPT, Claude,
      and Gemini. Use fresh sessions, record model/mode/locale/date and actual cited
      URLs. Repeat a sample to expose variability. URL-directed fetches are separate.
- [ ] Interview five potential users about the last gifting problem they had,
      their search language and their current workaround.
- [ ] Validate demand/seasonality using keyword tools where access is available.
- [ ] Rank four initial public pages and a short outreach list by relevance,
      observed demand, competition, demonstrable product fit and effort.

Initial hypotheses, not validated keyword-volume rankings:

| Hook                 | Example query                                  | Product boundary                                                             |
| -------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Cross-store list     | wishlist from different stores                 | Extraction editable; never promise100% retailer success                      |
| Easy sharing         | share wishlist without friends signing up      | Anonymous viewing; signed-in reactions; group membership for private gifting |
| Birthday             | share birthday gift ideas                      | One persistent personal list                                                 |
| Secret Santa         | Secret Santa with wishlists                    | Only implemented draw behavior; no advanced exclusions                       |
| Housewarming         | housewarming wishlist from several shops       | Not pooled funds, payments or shipping                                       |
| Private coordination | avoid duplicate gifts without ruining surprise | Reservations are group-scoped; public links expose none                      |
| Sharing etiquette    | how to politely share a birthday wishlist      | Useful message examples, no pressure to use the app                          |
| India/WhatsApp       | share gift wishlist India WhatsApp             | Validate local store flows and currencies first                              |

Starting source map from4October research (not proof of ranking influence):

- Giftster: https://www.giftster.com/ — first-party product comparison facts.
- Elfster: https://www.elfster.com/ — first-party Secret Santa behavior.
- MyRegistry: https://customercare.myregistry.com/en/support/solutions/articles/48001281475-can-i-create-a-housewarming-gift-list- — housewarming use case.
- https://www.reddit.com/r/Gifts/comments/1n9ui4h/need_a_wishlist_app/ — qualitative needs, not representative market-size evidence.
- https://alternativeto.net/software/elfster/ — relevant directory category.

## Slice 3: useful public content and proof

- [ ] /how-it-works: add, share, shop; standalone wishlist vs private groups;
      accounts, public visibility, extraction fallback, purchases at original store.
- [ ] /birthday-wishlist: practical list-building, notes, budgets and sharing
      etiquette; screenshots and a clear create-wishlist action.
- [ ] /secret-santa: organizer/participant walkthrough, supported modes, private
      assignments and reservations; accurately explain what recipients cannot see.
- [ ] One additional page selected by research (cross-store or housewarming).
- [ ] About/contact and accurate owner-reviewed policy information.
- [ ] Two real-product walkthrough videos and consented first-use stories.

Each page needs specific useful content, correct product claims, mobile and
keyboard review, a canonical, internal links, and explicit addition to the
marketing route allowlist. Do not auto-generate thin occasion/store pages. Do not
publish actual user wishlists as SEO examples; use labeled demonstrations.

## Slice 4: launch distribution (days12–24)

- [ ] Prepare Product Hunt listing and concise actual-product demo.
- [ ] Prepare an accurate AlternativeTo submission.
- [ ] Find reviewers/newsletters that already cover this category; prepare
      personalized review invitations. Editorial inclusion is never guaranteed.
- [ ] Read current r/Gifts/r/christmas rules before participating. Disclose maker
      affiliation. r/SideProject is a feedback channel, not proof of buyer demand.
- [ ] Publish selected approved materials; no mass posting, bought endorsements
      or manufactured reviews. External messages/posts require explicit send/publish
      instructions in the session; this backlog alone sends nothing.

Product Hunt: https://www.producthunt.com/launch/preparing-for-launch
Reddit: https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam

## Slice 5: measurement and iteration (days21–30)

- [ ] Verified crawler reporting: compare IPs with current official sources;
      user-agent claims alone are not verification. Exclude tokens, query strings,
      auth material, raw personal paths, emails and user content from SEO logs.
- [ ] Consent-aware acquisition enums for Google/Bing/ChatGPT/Claude/Product Hunt;
      retain current analytics redaction and do not collect arbitrary referrers.
- [ ] Distinguish crawl access, index coverage, unprompted assistant mentions,
      actual citations, referral visits, first saved item and first share.
- [ ] Repeat the fixed prompt set and compare cited URLs and factual accuracy.
- [ ] Measure production mobile performance before choosing optimizations.

There is no promised30-day ranking or citation threshold. Controllable outputs
are shipped technical controls, useful public pages, authentic distribution and
measurement. Training inclusion, crawling, indexing and recommendation are
separate outcomes. A user-requested fetch of our URL is not organic discovery.

## Official implementation references

- https://help.openai.com/en/articles/9237897-chatgpt-search
- https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers#google-extended
- https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
- https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
