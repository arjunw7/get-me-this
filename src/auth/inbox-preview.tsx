import Link from "next/link";

import { MailIcon } from "@/src/landing/icons";

import { DEMO_CODE } from "./fixtures";

/**
 * Mock of the sign-in email, ported from the frozen V18 reference
 * (components/auth/InboxPreview.tsx). This is demonstration content for the
 * static verify screen: no email exists, and the mock's copy (including the
 * "10 minutes" expiry) is part of the design, clearly framed as "The email
 * looks like this". The screen's preview notice states the static boundary.
 */
export function InboxPreview() {
  const [a, b] = [DEMO_CODE.slice(0, 3), DEMO_CODE.slice(3)];
  return (
    <div className="mx-auto max-w-95">
      <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-content-muted">
        <MailIcon className="h-4 w-4" />
        The email looks like this
      </p>
      <div className="rounded-surface-lg border-2 border-dashed border-outline-strong/25 bg-surface-sunken/60 p-4 text-content-secondary">
        <div className="flex items-center justify-between text-caption">
          <span className="font-bold text-content-primary">Get Me This</span>
          <span>now</span>
        </div>
        <p className="mt-1 text-sm font-semibold text-content-primary">
          Your sign-in code: {a}&nbsp;{b}
        </p>
        <p className="mt-1 text-caption">
          Or tap{" "}
          <Link
            href="/auth/confirm?state=valid"
            className="font-bold text-content-primary underline underline-offset-2"
          >
            Sign in to Get Me This
          </Link>{" "}
          in the email. Both expire in 10 minutes.
        </p>
      </div>
    </div>
  );
}
