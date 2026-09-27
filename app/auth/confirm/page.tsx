import type { Metadata } from "next";

import { ConfirmScreen } from "@/src/auth/confirm-screen";
import { parseConfirmVariant } from "@/src/auth/fixtures";

export const metadata: Metadata = {
  title: "Get Me This | Signing you in",
  description: "Magic-link sign-in confirmation.",
};

/**
 * Static magic-link confirmation route. Every state renders directly from
 * its URL fixture — no timer or animation gates application state:
 * bare route and `?state=loading` render the loading frame;
 * `?state=valid` the success frame; `?state=expired` the recovery frame.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.state;
  const variant = parseConfirmVariant(Array.isArray(raw) ? raw[0] : raw);
  return <ConfirmScreen variant={variant} />;
}
