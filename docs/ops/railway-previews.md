# Railway previews and CI gating

Every pull request becomes two pieces of reviewable evidence: a green
`CI` check (the required status check on `main`) and an ephemeral Railway
preview deployment. This document describes the required external
Railway configuration, the environment variables each deployment needs,
and the verification steps a reviewer completes without repository write
access.

## External Railway configuration (staging project)

Previews run in a **dedicated staging Railway project** that contains no
production data and no production secrets. The required setup, performed by
the project owner in the Railway dashboard:

1. Create the staging project and connect it to `arjunw7/get-me-this`
   through the Railway GitHub App.
2. Add the web service from the repository and give the base service a
   Railway-provided domain.
3. Enable **PR Environments** on the base service so each pull request
   gets an ephemeral environment, and enable **Wait for CI** so the
   preview deploys only after the required `CI` check is green.
4. Enable **Bot PR Environments** only if pull requests opened by
   automation (for example Factory) need their own previews.
5. Review the infrastructure proposal (`.railway/railway.ts`, Railway
   infrastructure-as-code with the Railpack builder) through
   `railway config plan` before it is applied. Nothing is applied without
   explicit approval, and the raw plan output is never committed.

## Automatic teardown

A preview environment is destroyed automatically when its pull request is
closed or merged. Previews are ephemeral by design: never store data in a
preview, and expect its URL to stop resolving after the pull request
closes.

## Environment variables

The deterministic reference route and the `/health` endpoint require **no
environment variables**. A preview deploys and passes its health check
with an empty environment.

Optional values (documented in [`.env.example`](../../.env.example)) are
for later approved slices. When a slice first needs one of them, the
preview environment inherits shared variables configured in the Railway
dashboard. Secret values live only in the Railway dashboard; they are
never committed to `.railway/` configuration, workflow files, or the
repository.

## Verifying a preview (no repository write access)

A reviewer verifies a preview with only a browser and the pull-request
page:

1. Open the Railway preview URL linked in the pull request description.
2. The deterministic fixture page renders at the reviewer's viewport.
3. Open `<preview-url>/health` (or `curl` it). The response is exactly
   `{"status":"ok"}` with HTTP 200, `Content-Type: application/json`, and
   `Cache-Control: no-store`, with no other fields.
4. In the pull request, confirm the required `CI` check is green and that
   its log shows `pnpm install --frozen-lockfile` followed by
   `pnpm verify`.
5. Optionally inspect the preview deployment logs in the Railway project.
   They must contain no secrets or personal data; report anything
   suspicious instead of proceeding.

No step above requires write access to the repository or the Railway
project.
