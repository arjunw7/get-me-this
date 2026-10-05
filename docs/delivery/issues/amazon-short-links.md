# Amazon app short links

User request: “Can you make sure that the short links are also handled?”

Example supplied by the user: `https://amzn.in/d/08uwFjwv`.

## Acceptance criteria

- Recognize exact Amazon short-link hosts, including Amazon India's `amzn.in`.
- Resolve supported short links to a matching Amazon product and use the independent browser worker without Firecrawl.
- Preserve the pasted source URL and editable metadata proposal.
- Validate every redirect under the existing network protections, with bounded redirects, bytes, cancellation and deadlines.
- Fail safely into manual entry for unsafe redirects, unsupported destinations or provider failures.

## Approved extension

User request: “Let’s finish everything in the same PR.”

- Amazon, including supported short links, goes directly to its dedicated browser route.
- Other stores use Firecrawl first, then independent Playwright, then editable manual input.
- Missing Firecrawl configuration, credit exhaustion and failed/incomplete extraction attempt the browser without dropping the source URL or available fields.
- Preserve cancellation, safe URL admission and one overall import deadline.
- Keep the worker isolated, authenticated and bounded; retain Amazon’s existing restrictions.
- Verify routing, negative network/resource controls, real rendering and representative live URLs.

Scope: server-side extraction and the existing worker image. No UI/schema changes,
new app dependencies or production infrastructure mutation. The worker image adds
Tini to reap terminated Chromium children. Upgrade the worker before the app rollout.
