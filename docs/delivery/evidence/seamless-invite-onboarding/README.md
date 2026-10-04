# Seamless invitation onboarding evidence

## Acceptance criteria from the user

- “I receive an invite, I click on join group. It asks me to log in.” The initial same-origin Join POST records consent in that flow’s authenticated cookie.
- “Either I log in via OTP or via a magic link … I should have it join the group automatically.” Both real local-provider browser journeys proceed directly through profile setup to Home. Reconciliation submits automatically; profile completion resumes the recorded decision.
- “As soon as my profile is made, I should just land on the home screen with the group already joined.” Browser assertions verify Home, one membership, one invitation use, and an accepted continuation. Replay consumes no additional use.

## Validation

- Invitation browser suite: 12/12 passing across desktop and mobile. Includes OTP, magic link, authenticated joining, invalid invitations, cross-origin/missing-origin submissions, and pending-delivery/logout recovery.
- Relevant local database suites: 4/4 passing, 219 assertions (`groups-006c`, `profiles-004e`, `profiles`, `profiles-vibe`), including negative authorization cases.
- Unit regressions cover consent preservation through the encrypted cookie and magic-link landing, legacy/no-consent flows, failed binding, profile completion, and one automatic POST under React StrictMode.
- Full verification result recorded in `verification.txt`.

Local runs used a dedicated Supabase stack and an isolated build directory to keep the user’s navigation preview running. Temporary ports, loopback allowlisting, build-directory configuration and generated route-type configuration are excluded from the change. No production resources were modified.

## Screenshots

Before/after pairs use the same reconciliation screen, synthetic flow, production styles, real bundled fonts, and viewport: desktop 1440×1000 and mobile 390×844. They show the previously repeated Continue screen becoming an automatic progress screen. Screenshots are static component renders; the real browser journeys above prove automatic submission and navigation. This transient screen has no matching frozen prototype reference; no different route/data state is presented as prototype evidence. Visual baselines were not changed.

## Deployment and rollback

No schema or RLS changes. Revert the application change to restore explicit joining. Existing cookies without the optional consent flag remain supported and require explicit joining; newly flagged cookies expire within the existing one-hour window. Database acceptance continues to enforce actor binding, expiry, revocation, capacity, membership generation and replay protections. A GET does not accept an invitation.

No Magic Patterns mock data or editor artifacts were shipped. Shared Railway preview is pending PR deployment.
