# Product-link extraction boundary

The `/wishlist/items/extract` browser endpoint is a same-origin, authenticated
Node.js POST boundary. It accepts one bounded JSON URL and returns only an
editable metadata proposal. It does not create a wishlist item, write Storage,
or emit analytics.

## Outbound transport

Every remote HTML or selected-image byte passes through
`src/wishlist/extraction/transport.ts`. The transport classifies the URL,
validates every DNS answer, deterministically selects one public address,
dials that exact address on a fresh socket, verifies the connected peer before
sending HTTP bytes, and re-runs those steps for each redirect. It does not use
framework `fetch`, proxy environment variables, pooled connections, cookies,
or authorization headers.

The reviewable limits are exported beside the implementation and covered by
deterministic fake-DNS/fake-socket tests: 10 seconds total, 2 seconds each for
DNS/connect/headers, 1 second body idle, three redirects, 16 KiB/100 response
headers, 1 MiB HTML, and 5 MiB image input. Compressed responses are rejected.

## Process admission

Admission is deliberately local to one Node process for the first deployment:
five attempts per user and 60 per process in a rolling minute, with two
simultaneous attempts per user and 16 per process. Every acquired concurrency
permit is released in `finally`. Scaling to more than one application instance
must add a shared limiter before aggregate capacity is raised.

## Untrusted parsing and images

HTML metadata is parsed as inert text in a killable 500 ms worker with a 64 MiB
heap limit and explicit node, depth, JSON-LD, metadata-value, and image-candidate
bounds. Returned text is normalized to plain Unicode and exact money uses
decimal strings and `BigInt` only.

Selected JPEG, PNG, or WebP candidates are fetched independently through the
same transport. A separate codec process is killed on the one-second deadline;
its V8 old space is capped at 64 MiB, libvips caching is disabled, and codec
concurrency is one. A 5 MiB input cap and 20-million-pixel cap further bound
work. These defenses are approved for staging but do not hard-limit native-code
RSS; production launch remains blocked until the service or container enforces
a hard memory boundary, or a separate production risk decision is explicitly
approved. The worker verifies the declared and sniffed static container,
dimensions, pixel count, and single-frame shape, then re-encodes a metadata-free
WebP no larger than 1,600 pixels on its longest side and 2 MiB. The function
returns bytes only to server code; private Storage selection and writing belong
to 005f.
