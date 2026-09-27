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

Only users without a completed profile see onboarding. Required field: display name. Optional field: avatar. Completion returns the user to the preserved destination.

Returning users never repeat onboarding unless their required profile data is missing.

## Intent destinations

- `wishlist` → first-item or wishlist experience
- `create-group` → group creation
- valid invitation → invitation acceptance and group
- no intent → authenticated Home

Only server-defined destinations are accepted. Never redirect to an arbitrary user-provided URL.

## Protected routes

All application routes require a valid session except the landing page, auth routes, and limited invitation preview. Typing an application URL while signed out redirects to `/auth` with a safe return intent.

## Logout

The account menu shows the user's email, My wishlist, Edit profile, and Log out. Logout requires confirmation because signing in again requires email access. After logout, clear local session data and return to the landing page with: **You're logged out. See you soon.**

