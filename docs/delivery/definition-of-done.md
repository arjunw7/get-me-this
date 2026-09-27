# Definition of done

A task is complete only when all applicable evidence exists.

## Product

- Acceptance criteria pass for happy paths, error paths, and negative cases.
- No out-of-scope capability was added.
- User-visible terminology matches the product and design contracts.
- Loading, empty, success, and failure states exist.

## Design

- Desktop and mobile screenshots are attached.
- Visual-regression tests pass against approved baselines.
- The result is compared with Magic Patterns Version 18 for hierarchy, layout, interaction, and responsive intent.
- The pull request links an apple-to-apple comparison for each changed route: deployed prototype reference, Railway preview, identical viewport, matching fixture/state, and any accepted differences.
- Keyboard, focus, contrast, labels, semantics, and reduced motion have been checked.
- No unapproved design change or Magic Patterns editor artifact remains.

## Engineering

- Type-check, lint, unit, database, end-to-end, visual, and production build checks pass as applicable.
- New behavior has tests that would fail without the implementation.
- No secrets or privileged credentials are exposed.
- Error paths are observable and safe.
- New dependencies are justified.
- New user behavior emits only catalogued, typed analytics events.
- Analytics tests verify event name, required properties, and sensitive-data exclusions.

## Database and security

- Schema change is a committed migration reproducible from an empty local database.
- RLS and least-privilege grants exist for every exposed table.
- Positive and negative authorization tests pass.
- Race-sensitive operations are transactional and covered by conflict tests.
- Migration deployment and rollback/forward-fix notes are included.

## Delivery

- Pull request is focused and independently reviewable.
- CI is green.
- Factory automated review findings are resolved or explicitly dismissed with reasoning.
- Sensitive changes receive security review.
- Railway preview is manually exercised.
- Human product/design approval is recorded before merge.
- The Linear issue links the pull request, Railway preview, verification evidence, and accepted product/design decision.
- Any affected PostHog dashboard or funnel is verified in staging with synthetic data.

Agents may not declare completion based only on generated code or a successful build.
