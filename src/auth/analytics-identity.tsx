"use client";

import { useEffect } from "react";

import { identifyAuthenticatedUser } from "@/src/analytics/client";

/**
 * Mounts the authenticated analytics identity (004e): after authentication,
 * `identify` is called exactly once per session with the internal Supabase
 * user UUID — never an email or display name. The adapter is consent-aware
 * (no-op while consent is pending or denied) and fails closed on a
 * non-UUID. Renders nothing.
 */
export function AnalyticsIdentity({ userId }: { userId: string }) {
  useEffect(() => {
    identifyAuthenticatedUser(userId);
  }, [userId]);
  return null;
}
