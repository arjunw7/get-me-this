# Amazon app short links

User request: “Can you make sure that the short links are also handled?”

Example supplied by the user: `https://amzn.in/d/08uwFjwv`.

## Acceptance criteria

- Recognize exact Amazon short-link hosts, including Amazon India's `amzn.in`.
- Resolve supported short links to a matching Amazon product and use the independent browser worker without Firecrawl.
- Preserve the pasted source URL and editable metadata proposal.
- Validate every redirect under the existing network protections, with bounded redirects, bytes, cancellation and deadlines.
- Fail safely into manual entry for unsafe redirects, unsupported destinations or provider failures.

Scope: server-side Amazon short-link support only. No generic Playwright fallback, UI, schema, dependency or infrastructure change.
