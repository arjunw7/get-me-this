# Initial issue backlog

Issues should be created from this ordered backlog only after the Production Build Pack is approved. Each issue must include explicit acceptance criteria and required proof.

## Foundation

1. Scaffold the production application and command surface.
2. Establish design tokens, typography, icons, and accessible primitives.
3. Establish test harness and deterministic visual fixtures.
4. Initialize Supabase local development, migrations, seeds, and database tests.
5. Configure GitHub CI and Railway preview deployment.
6. Establish typed PostHog instrumentation, privacy defaults, and analytics tests.

## Static fidelity pilot

7. Implement responsive landing page.
8. Implement email-auth and onboarding screens without backend behavior.
9. Review and approve initial visual baselines.

## Identity

10. Implement profiles schema, grants, RLS, and tests.
11. Implement email request and verification flows.
12. Implement magic-link callback and safe intent redirects.
13. Implement onboarding, protected routes, session restoration, account menu, and logout.
14. Configure Resend auth delivery and branded template.

## Wishlist

15. Implement wishlist/item schema, grants, RLS, and tests.
16. Implement wishlist display and empty state.
17. Implement manual item add/edit/delete.
18. Implement item reordering.
19. Implement product-link extraction security boundary.
20. Implement extraction review and manual fallback.
21. Implement original and approximate converted price presentation.

## Groups

22. Implement group/member/invitation schema and permission tests.
23. Implement group creation.
24. Implement invitation preview and authenticated acceptance.
25. Implement group room and member wishlist browsing.
26. Implement organizer membership controls and audit events.

## Coordination

27. Implement reaction schema and interaction.
28. Implement owner reaction summaries.
29. Implement copy-to-wishlist.
30. Implement reservation schema, transactional API, and race tests.
31. Implement gifting view and external purchase action.

## Modes and launch

32. Implement wishlist-only mode.
33. Implement gift-everyone checklist.
34. Implement secret-draw algorithm and invariant tests.
35. Implement private assignment UI, redraw, and departure behavior.
36. Implement transactional emails.
37. Complete accessibility, security, performance, abuse-prevention, and production-readiness passes.
