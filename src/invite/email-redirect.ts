import "server-only";

import { emailRedirectToForOrigin } from "@/src/auth/email-redirect";
import { isFlowId } from "./token";

/**
 * The trusted, flow-specific `emailRedirectTo` (brief 006c): the request
 * origin may only SELECT an allowlisted entry (the 004c table), and the
 * flow-specific path is appended only when the flow id is a canonical UUID
 * already bound to the request's sealed cookie. No caller-provided origin,
 * path, query, or full URL is ever used.
 */
export function invitationEmailRedirectTo(
  origin: string | null,
  flowId: string,
): string | null {
  if (!isFlowId(flowId)) return null;
  const generic = emailRedirectToForOrigin(origin);
  if (generic === null) return null;
  // The allowlisted entries all end with /auth/confirm; the invitation
  // confirmation route replaces exactly that suffix.
  const suffix = "/auth/confirm";
  if (!generic.endsWith(suffix)) return null;
  return `${generic.slice(0, generic.length - suffix.length)}/auth/confirm/invite/${flowId}`;
}
