# Authentication and account flow

## Principle

There is one email-only entry flow. The product never asks the user to choose between signing up and logging in.

## Routes

- `/auth`
- `/auth/verify`
- `/auth/confirm`
- `/onboarding`

## Email entry

The user enters an email and selects **Continue with email**. The request carries an allowed return intent such as `wishlist`, `create-group`, or an invitation token.

The interface explains: **No password. We'll send you a secure code and sign-in link.**

### Acceptance criteria

- A valid email sends one branded message through Supabase Auth using Resend delivery.
- The email contains both an OTP and a magic-link action.
- The public response does not reveal whether the account already exists.
- Repeat requests respect a visible resend delay.
- Invalid input is rejected before a network request.

## Verification

The user may enter the OTP or click the email link. Both establish the same session and preserve the same validated return intent.

Errors include invalid code, expired code/link, excessive attempts, and unavailable delivery. Every error has a safe recovery path.

## Onboarding

Only users without a completed profile see onboarding. Required field: display name. Optional field: taste line. Choose a **Vibe** from Tomato, Marigold, Electric, and Acid lime, with Marigold selected by default. The chosen Vibe is saved to the authenticated owner’s profile on both ordinary and invitation onboarding; an uploaded avatar is not part of this flow. Ordinary completion returns the user to the honest authenticated `/home`. The public-wishlist sign-in flow is the bounded exception: it retains a validated public wishlist identifier through onboarding and returns to that wishlist after the profile is saved. Invitation onboarding saves the same profile fields, then resumes the original Join decision through the existing validated acceptance function and lands on Home. The decision is carried only in the sealed browser-bound continuation after the first Join POST. Both OTP and magic-link authentication reconcile automatically; they do not require another Join click. A legacy continuation without this recorded decision still returns to the preview.

Returning users never repeat onboarding unless their required profile data is missing.

## Intent destinations

- `wishlist` → first-item or wishlist experience
- `create-group` → group creation
- `public-wishlist` with a canonical public share identifier → `/s/{identifier}`, including after new-account onboarding
- valid invitation → invitation acceptance and group
- no intent → authenticated Home

Only server-defined destinations are accepted. Never redirect to an arbitrary user-provided URL. A public share identifier must be the canonical 43-character base64url representation of 32 random bytes; malformed identifiers fall back safely to Home. It is carried only for the `public-wishlist` intent, never attached to unrelated auth flows.

### Return from a public wishlist

A visitor can view a shared wishlist without signing in. **Sign in to react** opens `/auth?intent=public-wishlist&share={identifier}`. The ordinary email-code flow carries the validated identifier in its short-lived HttpOnly auth cookie; same-browser OTP and magic-link completion share the same destination logic. Because the cookie is scoped to `/auth`, a new account receives the validated identifier through the onboarding route and form, with server-side validation repeated on submission. Invitation onboarding retains its separate continuation protocol.

Authentication never submits a reaction automatically. The visitor returns to the wishlist and explicitly chooses a reaction. If the owner revoked sharing while the visitor signed in, the public route shows its unavailable state and accepts no reaction. Opening the email link in a different browser without the original carry cookie uses the ordinary Home/onboarding fallback; the visitor can reopen the shared link afterward.

Public identifiers and pending reactions are not analytics properties. Public continuation forms block capture; URL analytics discard query strings and sanitize route identifiers. No reaction intent is stored.

## Protected routes

All application routes require a valid session except the landing page, auth routes, and limited invitation preview. Typing an application URL while signed out redirects to `/auth` with a safe return intent.

## Logout

The account menu shows the user’s email, My wishlist, Edit profile, and confirmed Log out. Edit profile opens a keyboard-accessible dialog (a bottom sheet on mobile) for name, personality line, and Vibe. The Vibe picker opens with the owner’s saved selection and the same four options as onboarding. The server verifies the session and updates only that owner’s row under RLS; errors retain the draft, and successful saves refresh Home, wishlist, and group views. Vibe persists across sessions and is visible to joined members through shared active groups. Cancel discards unsaved changes. Invalid Vibe values are rejected server-side; an older submission without the field leaves an existing choice unchanged. Uploaded avatar preferences remain outside the persisted profile model. Logout requires confirmation because signing in again requires email access. After logout, clear local session data and return to the landing page with: **You're logged out. See you soon.**
