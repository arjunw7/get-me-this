"use server";

import { redirect } from "next/navigation";

import { getServerAnalytics } from "@/src/analytics/server";
import { requireCompleteProfile } from "@/src/profile/session";

import type { CreateGroupActionState } from "./action-state";
import type { CanonicalPayloadV1 } from "./canonical";
import { createGroupWithReceipt } from "./group-write";
import { validateGroupForm, type GroupFormFields } from "./validation";

/**
 * The protected create-group Server Action (brief 006b).
 *
 * Authority flows from the authenticated session only: the action never
 * accepts an actor id, organizer flag, or group id, and never uses a
 * privileged admin credential — the database function derives the actor from
 * auth.uid() and repeats all validation. On success it redirects (303) to the
 * organizer-only created route carrying the stable group id in the path and
 * nothing else — never invitation data, receipts, or internal state.
 */

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function field(name: string, data: FormData): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}

export async function createGroupAction(
  _previous: CreateGroupActionState,
  data: FormData,
): Promise<CreateGroupActionState> {
  const { userId } = await requireCompleteProfile();

  const fields: GroupFormFields = {
    name: field("name", data),
    occasionType: field("occasionType", data),
    occasionDate: field("occasionDate", data),
    timeZone: field("timeZone", data),
    budgetAmount: field("budgetAmount", data),
    budgetCurrency: field("budgetCurrency", data),
    mode: field("mode", data),
  };
  const requestKey = field("requestKey", data);

  // The request key is browser-generated input, never authority; an absent
  // or malformed one is a safe recovery error, not a bypass.
  if (!UUID_V4_PATTERN.test(requestKey)) {
    return {
      status: "unavailable",
    };
  }

  const validation = validateGroupForm(fields);
  if (!validation.ok) {
    return { status: "invalid", errors: validation.errors };
  }

  // The missing-or-invalid-zone case never substitutes the server zone or UTC.
  if (
    validation.payload.time_zone.length === 0 ||
    validation.payload.time_zone.length > 64
  ) {
    return {
      status: "invalid",
      errors: { form: "Your time zone could not be determined." },
    };
  }

  const outcome = await createGroupWithReceipt(requestKey, validation.payload);

  if (outcome.kind === "created") {
    await emitGroupCreated(
      userId,
      outcome.groupId,
      validation.payload,
      outcome.createdNow,
    );
    // Server Actions respond 303 by default: the created route is reached by
    // a fresh GET, never a cacheable POST result.
    redirect(`/groups/${outcome.groupId}/created`);
  }
  if (outcome.kind === "conflict") return { status: "conflict" };
  return { status: outcome.kind === "retry" ? "retry" : "unavailable" };
}

/**
 * The single server-authoritative `group_created` event, attempted only for
 * the committed first creation (`created_now`). Group name, date, time zone,
 * request key, payload digest, budget value, and invitation data never enter
 * analytics. An analytics failure never rolls back or misreports a successful
 * creation.
 */
async function emitGroupCreated(
  userId: string,
  groupId: string,
  payload: CanonicalPayloadV1,
  createdNow: boolean,
): Promise<void> {
  if (!createdNow) return;
  try {
    await getServerAnalytics().capture(
      "group_created",
      {
        occasion_type: payload.occasion_type,
        gifting_mode:
          payload.mode === "secret_draw"
            ? "draw_names"
            : payload.mode === "gift_everyone"
              ? "gift_everyone"
              : "share_wishlists_only",
        currency: payload.budget_currency,
        has_budget_cap: true,
      },
      { distinctId: userId, group: { id: groupId } },
    );
  } catch {
    // Analytics failure cannot turn a committed creation into a failure.
  }
}
