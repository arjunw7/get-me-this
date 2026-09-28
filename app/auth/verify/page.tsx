import type { Metadata } from "next";

import { VerifyScreen } from "@/src/auth/verify-screen";
import { parseVerifyVariant } from "@/src/auth/fixtures";

export const metadata: Metadata = {
  title: "Get Me This | Check your inbox",
  description:
    "This is the sign-in email design — a six-digit code and a sign-in link.",
};

/**
 * Static OTP-verification route. Designed states are URL fixtures:
 * default (bare route), `?state=error`, `?state=expired`.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.state;
  const variant = parseVerifyVariant(Array.isArray(raw) ? raw[0] : raw);
  return <VerifyScreen variant={variant} />;
}
