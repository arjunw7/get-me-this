import "server-only";

import {
  createSupabaseRequestOnlyClient,
  createSupabaseServerClient,
} from "@/src/supabase/server";

/**
 * Server-side invitation continuation data access (brief 006c). Every call
 * goes through the 006c public database API — never a base-table query,
 * never a privileged admin credential, never a raw token after the initial
 * begin. Authority flows from the sealed browser cookie and the verified
 * session, re-derived inside the database functions.
 *
 * Result mapping is closed and typed; every invalid cause maps to the same
 * generic unavailable/restart results. No result ever carries a token,
 * email, browser secret, coordinator secret, or internal state.
 */

export type FlowBegin = {
  readonly flowId: string;
  readonly expiresAt: string;
};

type BeginRpcRow = { flow_id: unknown; expires_at: unknown };

/** Begins a continuation from the raw token (later flows, established
 * coordinator). The token is consumed as a transient argument only. */
export async function beginFlowFromToken(
  token: string,
  browserSecret: string,
  coordinatorSecret: string,
): Promise<FlowBegin | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const { data, error } = await client.rpc("begin_group_invitation_flow", {
    p_token: token,
    p_browser_secret: browserSecret,
    p_coordinator_secret: coordinatorSecret,
  });
  if (error) return null;
  const row = (data as BeginRpcRow[] | null)?.[0];
  if (
    !row ||
    typeof row.flow_id !== "string" ||
    typeof row.expires_at !== "string"
  ) {
    return null;
  }
  return { flowId: row.flow_id, expiresAt: row.expires_at };
}

/** Begins a continuation from the consumed-once pending start. */
export async function beginFlowFromStart(
  startId: string,
  browserSecret: string,
  pendingNonce: string,
  coordinatorSecret: string,
): Promise<FlowBegin | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const { data, error } = await client.rpc(
    "begin_group_invitation_flow_from_start",
    {
      p_start_id: startId,
      p_browser_secret: browserSecret,
      p_pending_nonce: pendingNonce,
      p_coordinator_secret: coordinatorSecret,
    },
  );
  if (error) return null;
  const row = (data as BeginRpcRow[] | null)?.[0];
  if (
    !row ||
    typeof row.flow_id !== "string" ||
    typeof row.expires_at !== "string"
  ) {
    return null;
  }
  return { flowId: row.flow_id, expiresAt: row.expires_at };
}

/** Creates the one-use pending start for the token-free bootstrap. */
export async function createPendingStart(
  token: string,
  nonce: string,
): Promise<{ startId: string; expiresAt: string } | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;

  const { data, error } = await client.rpc(
    "create_group_invitation_pending_start",
    {
      p_token: token,
      p_nonce: nonce,
    },
  );
  if (error) return null;
  const row = (
    data as { start_id: unknown; expires_at: unknown }[] | null
  )?.[0];
  if (
    !row ||
    typeof row.start_id !== "string" ||
    typeof row.expires_at !== "string"
  ) {
    return null;
  }
  return { startId: row.start_id, expiresAt: row.expires_at };
}

export type InvitePreview = {
  readonly hostDisplayName: string;
  readonly groupName: string;
  readonly occasionAt: string;
  readonly budgetAmountMinor: number | null;
  readonly budgetCurrency: string | null;
  readonly mode: string;
  readonly joinedMemberCount: number;
};

type PreviewRpcRow = {
  host_display_name: unknown;
  group_name: unknown;
  occasion_at: unknown;
  budget_amount_minor: unknown;
  budget_currency: unknown;
  mode: unknown;
  joined_member_count: unknown;
};

/**
 * The seven-field live preview through a valid flow. Null for every
 * invalid, invalidated, expired, revoked, or exhausted cause — one generic
 * empty result, no enumeration, no write.
 */
export async function previewFlow(
  flowId: string,
  browserSecret: string,
): Promise<InvitePreview | null> {
  const client = await createSupabaseRequestOnlyClient();
  if (!client) return null;

  const { data, error } = await client.rpc("preview_group_invitation_flow", {
    p_flow_id: flowId,
    p_browser_secret: browserSecret,
  });
  if (error) return null;
  const row = (data as PreviewRpcRow[] | null)?.[0];
  if (
    !row ||
    typeof row.host_display_name !== "string" ||
    typeof row.group_name !== "string" ||
    typeof row.occasion_at !== "string" ||
    typeof row.mode !== "string" ||
    typeof row.joined_member_count !== "number"
  ) {
    return null;
  }
  return {
    hostDisplayName: row.host_display_name,
    groupName: row.group_name,
    occasionAt: row.occasion_at,
    budgetAmountMinor:
      typeof row.budget_amount_minor === "number"
        ? row.budget_amount_minor
        : null,
    budgetCurrency:
      typeof row.budget_currency === "string" ? row.budget_currency : null,
    mode: row.mode,
    joinedMemberCount: row.joined_member_count,
  };
}

export type BindEmailResult = "bound" | "restart" | "unavailable";

export async function bindFlowEmail(
  flowId: string,
  browserSecret: string,
  email: string,
): Promise<BindEmailResult> {
  const client = await createSupabaseServerClient();
  if (!client) return "unavailable";

  const { data, error } = await client.rpc("bind_group_invitation_flow_email", {
    p_flow_id: flowId,
    p_browser_secret: browserSecret,
    p_email: email,
  });
  if (error) return "unavailable";
  const result = (data as { result: unknown }[] | null)?.[0]?.result;
  return result === "bound" || result === "restart" ? result : "unavailable";
}

export type VerifyFlowResult = "verified" | "restart";

/**
 * Session-derived verification and idempotent reconciliation. The user and
 * canonical email are derived inside the database from the verified
 * session; this call never re-verifies with the provider and never
 * accepts.
 */
export async function verifyFlow(
  flowId: string,
  browserSecret: string,
): Promise<VerifyFlowResult | null> {
  const client = await createSupabaseRequestOnlyClient();
  if (!client) return null;

  const { data, error } = await client.rpc("verify_group_invitation_flow", {
    p_flow_id: flowId,
    p_browser_secret: browserSecret,
  });
  // A lost authorization race can surface as a database error; the caller
  // treats it as restart.
  if (error) return "restart";
  const result = (data as { result: unknown }[] | null)?.[0]?.result;
  return result === "verified" ? "verified" : "restart";
}

export type FlowState = {
  readonly state: "verified" | "accepted";
  readonly groupId: string | null;
  readonly beganAuthenticated: boolean;
};

type StateRpcRow = {
  state: unknown;
  group_id: unknown;
  began_authenticated: unknown;
};

/** The minimal authenticated continuation-state projection. */
export async function loadFlowState(
  flowId: string,
  browserSecret: string,
): Promise<FlowState | null> {
  const client = await createSupabaseRequestOnlyClient();
  if (!client) return null;

  const { data, error } = await client.rpc("group_invitation_flow_state", {
    p_flow_id: flowId,
    p_browser_secret: browserSecret,
  });
  if (error) return null;
  const row = (data as StateRpcRow[] | null)?.[0];
  if (!row || (row.state !== "verified" && row.state !== "accepted"))
    return null;
  return {
    state: row.state,
    groupId: typeof row.group_id === "string" ? row.group_id : null,
    beganAuthenticated: row.began_authenticated === true,
  };
}

export type AcceptOutcome =
  | {
      kind: "accepted";
      result: "joined" | "replayed" | "already_joined";
      groupId: string | null;
      acceptedNow: boolean;
    }
  | { kind: "unavailable" }
  | { kind: "retry" };

type AcceptRpcRow = {
  result: unknown;
  group_id: unknown;
  accepted_now: unknown;
};

/**
 * The continuation-bound acceptance through the caller's own authenticated
 * session (request-only client: the handler may validate but never write
 * session or invitation cookies). A 40001 lost-race rejection maps to
 * "unavailable" with every write rolled back by the database.
 */
export async function acceptFlow(
  flowId: string,
  browserSecret: string,
): Promise<AcceptOutcome> {
  const client = await createSupabaseRequestOnlyClient();
  if (!client) return { kind: "unavailable" };

  const { data, error } = await client.rpc("accept_group_invitation_flow", {
    p_flow_id: flowId,
    p_browser_secret: browserSecret,
  });
  if (error) {
    return error.code === "40001" ? { kind: "unavailable" } : { kind: "retry" };
  }
  const row = (data as AcceptRpcRow[] | null)?.[0];
  if (
    !row ||
    (row.result !== "joined" &&
      row.result !== "replayed" &&
      row.result !== "already_joined")
  ) {
    return { kind: "unavailable" };
  }
  return {
    kind: "accepted",
    result: row.result,
    groupId: typeof row.group_id === "string" ? row.group_id : null,
    acceptedNow: row.accepted_now === true,
  };
}

/** Confirmed discard of one proven unaccepted flow. */
export async function discardFlow(
  flowId: string,
  browserSecret: string,
  coordinatorSecret: string,
): Promise<boolean> {
  const client = await createSupabaseServerClient();
  if (!client) return false;

  const { data, error } = await client.rpc("discard_group_invitation_flow", {
    p_flow_id: flowId,
    p_browser_secret: browserSecret,
    p_coordinator_secret: coordinatorSecret,
  });
  if (error) return false;
  return (data as { result: unknown }[] | null)?.[0]?.result === "discarded";
}

export type LogoutInvalidationResult = "invalidated" | "unavailable";

/**
 * The authoritative-inventory logout invalidation: every supplied cookie
 * must belong to the derived unreleased inventory and verify against its
 * stored browser-secret digest, all in one transaction.
 */
export async function invalidateFlowsForLogout(
  flowIds: string[],
  browserSecrets: string[],
  coordinatorSecret: string,
): Promise<LogoutInvalidationResult> {
  const client = await createSupabaseServerClient();
  if (!client) return "unavailable";

  const { data, error } = await client.rpc(
    "invalidate_group_invitation_flows_for_logout",
    {
      p_flow_ids: flowIds,
      p_browser_secrets: browserSecrets,
      p_coordinator_secret: coordinatorSecret,
    },
  );
  if (error) return "unavailable";
  const result = (data as { result: unknown }[] | null)?.[0]?.result;
  return result === "invalidated" ? "invalidated" : "unavailable";
}

export type LeaseResult = {
  readonly outcome:
    | "acquired"
    | "blocked"
    | "epoch"
    | "pending"
    | "acknowledged"
    | "abandoned"
    | "idle"
    | "unavailable";
  readonly sessionEpoch: number | null;
};

type LeaseRpcRow = { result: unknown; session_epoch: unknown };

function mapLeaseRow(
  row: LeaseRpcRow | undefined,
  fallback: LeaseResult["outcome"],
): LeaseResult {
  if (!row || typeof row.result !== "string") {
    return { outcome: fallback, sessionEpoch: null };
  }
  const valid = [
    "acquired",
    "blocked",
    "epoch",
    "pending",
    "acknowledged",
    "abandoned",
    "idle",
  ] as const;
  const outcome = valid.find((value) => value === row.result) ?? fallback;
  return {
    outcome,
    sessionEpoch:
      typeof row.session_epoch === "number" ? row.session_epoch : null,
  };
}

/** The invitation-auth mutation lease acquisition (reviewed server boundary). */
export async function acquireAuthLease(
  coordinatorSecret: string,
  expectedEpoch: number,
  kind:
    | "otp_verify"
    | "magic_link_verify"
    | "refresh"
    | "logout"
    | "account_replace",
): Promise<LeaseResult> {
  const client = await createSupabaseRequestOnlyClient();
  if (!client) return { outcome: "unavailable", sessionEpoch: null };
  const { data, error } = await client.rpc(
    "acquire_group_invitation_auth_lease",
    {
      p_coordinator_secret: coordinatorSecret,
      p_expected_epoch: expectedEpoch,
      p_kind: kind,
    },
  );
  if (error) return { outcome: "unavailable", sessionEpoch: null };
  return mapLeaseRow((data as LeaseRpcRow[] | null)?.[0], "unavailable");
}

/** Moves the held lease to delivery_pending with the one-use nonce. */
export async function markDeliveryPending(
  coordinatorSecret: string,
  expectedEpoch: number,
  deliveryNonce: string,
  expectedProviderUserId: string | null,
): Promise<LeaseResult> {
  const client = await createSupabaseRequestOnlyClient();
  if (!client) return { outcome: "unavailable", sessionEpoch: null };
  const { data, error } = await client.rpc(
    "mark_group_invitation_delivery_pending",
    {
      p_coordinator_secret: coordinatorSecret,
      p_expected_epoch: expectedEpoch,
      p_delivery_nonce: deliveryNonce,
      p_expected_provider_user_id: expectedProviderUserId,
    },
  );
  if (error) return { outcome: "unavailable", sessionEpoch: null };
  return mapLeaseRow((data as LeaseRpcRow[] | null)?.[0], "unavailable");
}

/** Verifies the delivery nonce, advances the epoch, releases the lease. */
export async function acknowledgeDelivery(
  coordinatorSecret: string,
  deliveryNonce: string,
  expectedProviderUserId: string | null,
): Promise<LeaseResult> {
  const client = await createSupabaseRequestOnlyClient();
  if (!client) return { outcome: "unavailable", sessionEpoch: null };
  const { data, error } = await client.rpc(
    "acknowledge_group_invitation_delivery",
    {
      p_coordinator_secret: coordinatorSecret,
      p_delivery_nonce: deliveryNonce,
      p_expected_provider_user_id: expectedProviderUserId,
    },
  );
  if (error) return { outcome: "unavailable", sessionEpoch: null };
  return mapLeaseRow((data as LeaseRpcRow[] | null)?.[0], "unavailable");
}

/**
 * Recovery under the still-exclusive lease: acknowledges a provable
 * delivery or abandons it to idle for an honest fresh-credential restart.
 */
export async function recoverAuthLease(
  coordinatorSecret: string,
  deliveryNonce: string | null,
): Promise<LeaseResult> {
  const client = await createSupabaseRequestOnlyClient();
  if (!client) return { outcome: "unavailable", sessionEpoch: null };
  const { data, error } = await client.rpc(
    "recover_group_invitation_auth_lease",
    {
      p_coordinator_secret: coordinatorSecret,
      p_delivery_nonce: deliveryNonce,
    },
  );
  if (error) return { outcome: "unavailable", sessionEpoch: null };
  return mapLeaseRow((data as LeaseRpcRow[] | null)?.[0], "unavailable");
}

export type BootstrapResult =
  | { outcome: "established"; coordinatorId: string }
  | { outcome: "unavailable" };

/** Token-free coordinator establishment (bootstrap phase one). */
export async function establishCoordinator(
  coordinatorSecret: string,
  bootstrapLease: string,
): Promise<BootstrapResult> {
  const client = await createSupabaseServerClient();
  if (!client) return { outcome: "unavailable" };
  const { data, error } = await client.rpc(
    "establish_group_invitation_coordinator",
    {
      p_coordinator_secret: coordinatorSecret,
      p_bootstrap_lease: bootstrapLease,
    },
  );
  if (error) return { outcome: "unavailable" };
  const row = (
    data as { result: unknown; coordinator_id: unknown }[] | null
  )?.[0];
  if (
    !row ||
    row.result !== "established" ||
    typeof row.coordinator_id !== "string"
  ) {
    return { outcome: "unavailable" };
  }
  return { outcome: "established", coordinatorId: row.coordinator_id };
}

/** Consumes the one-use bootstrap lease (bootstrap phase two). */
export async function consumeBootstrapLease(
  coordinatorSecret: string,
  bootstrapLease: string,
): Promise<BootstrapResult> {
  const client = await createSupabaseServerClient();
  if (!client) return { outcome: "unavailable" };
  const { data, error } = await client.rpc(
    "consume_group_invitation_bootstrap_lease",
    {
      p_coordinator_secret: coordinatorSecret,
      p_bootstrap_lease: bootstrapLease,
    },
  );
  if (error) return { outcome: "unavailable" };
  const row = (
    data as { result: unknown; coordinator_id: unknown }[] | null
  )?.[0];
  if (
    !row ||
    row.result !== "consumed" ||
    typeof row.coordinator_id !== "string"
  ) {
    return { outcome: "unavailable" };
  }
  return { outcome: "established", coordinatorId: row.coordinator_id };
}
