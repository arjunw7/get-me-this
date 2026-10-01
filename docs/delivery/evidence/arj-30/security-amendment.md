# ARJ-30 staging codec-memory exception

Date: 2026-10-01

The owner approved staging validation of product-image normalization without
the brief's earlier hard 256 MiB per-codec RSS guarantee. That guarantee is not
enforceable from the Node.js/V8 process flags used here because native codec
allocations are outside the V8 heap.

The staging boundary is instead the implemented defense-in-depth contract:

- separate killable codec process;
- one-second codec deadline;
- 64 MiB V8 old-space cap;
- disabled libvips cache;
- codec concurrency of one;
- 5 MiB encoded-input cap; and
- 20-million-pixel decoded-image cap.

This is a staging-only security exception. Whole-service or container memory is
the deployment responsibility. Production launch remains blocked until a hard
OS/container memory boundary is enforced or a separate production risk decision
is reviewed and explicitly approved.

No other extraction, transport, parsing, image, privacy, or authorization limit
was changed by this amendment.
