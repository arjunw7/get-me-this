import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { VerifyFlowScreen } from "@/src/auth/verify-flow-screen";
import { VerifyScreen } from "@/src/auth/verify-screen";
import { parseVerifyVariant } from "@/src/auth/fixtures";
import { readAuthCarry } from "@/src/auth/carry-cookie";
import { RESEND_COOLDOWN_SECONDS } from "@/src/auth/flow-config";
import { createSupabaseServerClient } from "@/src/supabase/server";

export const metadata: Metadata = {
  title: "Get Me This | Check your inbox",
  description: "Enter the six-digit code we sent to your email.",
};

/**
 * The OTP-verification route of the real email-code flow (004c).
 *
 * The bare route is the real flow: it renders the code-entry screen from
 * the validated HttpOnly carry cookie, the signed-in boundary when a
 * session exists without one, and redirects to the entry screen when
 * neither is present (a safe restart, never an error). The `?state=`
 * URL fixtures render the static reference states for deterministic
 * fixture capture and tests only — they are not part of the live flow.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.state;
  if (raw !== undefined) {
    const variant = parseVerifyVariant(Array.isArray(raw) ? raw[0] : raw);
    return <VerifyScreen variant={variant} />;
  }

  const carry = await readAuthCarry();
  if (carry) {
    return (
      <VerifyFlowScreen
        email={carry.email}
        resendSeconds={RESEND_COOLDOWN_SECONDS}
      />
    );
  }

  // A session without a carry cookie (for example after reloading the
  // verified screen) shows the signed-in boundary with the minimal
  // local-scoped sign-out.
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email) {
      return (
        <VerifyFlowScreen
          email={user.email}
          resendSeconds={RESEND_COOLDOWN_SECONDS}
          signedIn
        />
      );
    }
  }

  redirect("/auth");
}
