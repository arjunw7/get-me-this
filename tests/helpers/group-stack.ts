import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Superuser SQL fixtures and probes for the stack-gated group specs (006b).
 *
 * The group tables are revoked from service_role by design (006a), so fixture
 * teardown and state manipulation cannot go through the admin client. These
 * helpers run superuser SQL inside the LOCAL Supabase stack's database
 * container, located exactly (label + exact name) the way the race harnesses
 * locate it — never a remote, hosted, staging, or production database.
 *
 * No probe selects token material: only versions, statuses, counts, ids, and
 * generations ever cross the boundary, so a test failure can never print a
 * bearer token or invite link into CI logs.
 */

/** The local stack's database container, located exactly (label + name). */
export function stackDbContainer(): string {
  const config = readFileSync(
    path.join(process.cwd(), "supabase", "config.toml"),
    "utf8",
  );
  const projectId = config.match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1] ?? "";
  if (!projectId) {
    throw new Error("could not read project_id from supabase/config.toml");
  }
  return `supabase_db_${projectId}`;
}

/** Runs superuser SQL inside the LOCAL stack's database container and
 * returns its captured stdout (stderr is discarded). */
export function runStackSql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      stackDbContainer(),
      "psql",
      "--no-psqlrc",
      "--quiet",
      "--no-align",
      "--tuples-only",
      "--user",
      "postgres",
      "--dbname",
      "postgres",
      "--set",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "pipe", "ignore"], timeout: 20_000 },
  ).toString();
}

/** Session identity for SQL-side RPC calls (the auth.uid() GUC surface). */
export function withIdentity(userId: string, sql: string): string {
  return [
    `set request.jwt.claim.sub = '${userId}';`,
    "set request.jwt.claim.role = 'authenticated';",
    `set request.jwt.claims = '{"sub":"${userId}","role":"authenticated"}';`,
    sql,
  ].join("\n");
}

/**
 * The created group references fixture users through restrictive foreign
 * keys, so teardown runs as superuser SQL in restrict-FK order. Each list
 * may be empty independently: an empty list drops its `in` clause instead
 * of emitting the invalid `in ()` (the pending-state spec deletes by group
 * id alone).
 */
export function deleteFixtureGroupsSql(
  groupIds: string[],
  userIds: string[],
): void {
  if (groupIds.length === 0 && userIds.length === 0) return;
  const list = (values: string[]) =>
    values.map((v) => `'${v}'::uuid`).join(",");
  const matches = (column: string, values: string[]) =>
    values.length > 0 ? `${column} in (${list(values)})` : null;
  const where = (...clauses: Array<string | null>): string => {
    const parts = clauses.filter((clause) => clause !== null);
    return parts.length > 0 ? ` where ${parts.join(" or ")}` : "";
  };
  // Never an unfiltered subselect: with no group ids the invitation clause
  // must match nothing, not every invitation row.
  const groupInvitationUses =
    groupIds.length > 0
      ? `invitation_id in (select id from public.group_invitations where group_id in (${list(groupIds)}))`
      : null;
  // The 008d assignment-email outbox rows carry no group column: they match
  // through the exact 008c identity key's group segment or the recipient.
  const assignmentEmailClauses = [
    ...groupIds.map((id) => `idempotency_key like 'assignment:${id}:%'`),
    ...(userIds.length > 0
      ? [
          "template_key = 'assignment' and recipient_user_id in (" +
            list(userIds) +
            ")",
        ]
      : []),
  ];
  const assignmentEmailWhere =
    assignmentEmailClauses.length > 0
      ? ` where (${assignmentEmailClauses.join(" or ")})`
      : "";
  const sql = [
    `delete from private.email_outbox${assignmentEmailWhere};`,
    `delete from public.audit_events${where(matches("group_id", groupIds), matches("actor_id", userIds))};`,
    `delete from public.group_invitation_uses${where(groupInvitationUses, matches("user_id", userIds))};`,
    `delete from public.group_invitations${where(matches("group_id", groupIds))};`,
    `delete from public.group_creation_receipts${where(matches("group_id", groupIds), matches("actor_id", userIds))};`,
    // The 008c/008d assignment history and viewed markers restrict into
    // group_members, so they go before the membership rows.
    `delete from public.group_assignment_views${where(matches("group_id", groupIds), matches("giver_id", userIds))};`,
    `delete from public.group_assignments${where(matches("group_id", groupIds), matches("giver_id", userIds), matches("recipient_id", userIds))};`,
    `delete from public.group_members${where(matches("group_id", groupIds), matches("user_id", userIds))};`,
    `delete from public."groups"${where(matches("id", groupIds), matches("organizer_id", userIds))};`,
  ].join("\n");
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      stackDbContainer(),
      "psql",
      "--no-psqlrc",
      "--user",
      "postgres",
      "--dbname",
      "postgres",
      "--set",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "ignore", "pipe"], timeout: 20_000 },
  );
}

/** The group's durable shareable-invitation version (internal, no tokens). */
export function stackGroupVersion(groupId: string): string {
  return runStackSql(
    `select shareable_invitation_version::text from public."groups" where id = '${groupId}'::uuid;`,
  ).trim();
}

export function stackOrganizerGroupCount(organizerId: string): number {
  return Number.parseInt(
    runStackSql(
      `select count(*)::text from public."groups" where organizer_id = '${organizerId}'::uuid;`,
    ).trim(),
    10,
  );
}

/**
 * Another-tab issuer: a direct generic compare-and-swap issue through the
 * same RPC the UI action uses. Selects only the version — never the token.
 */
export function stackIssueGeneric(
  organizerId: string,
  groupId: string,
): string {
  return runStackSql(
    withIdentity(
      organizerId,
      `select invitation_version::text from public.issue_group_invitation('${groupId}'::uuid, (select shareable_invitation_version from public."groups" where id = '${groupId}'::uuid));`,
    ),
  ).trim();
}

/** The current generic invitation row's id and status (no token material). */
export function stackGenericInvitation(groupId: string): {
  id: string;
  status: string;
} {
  const row = runStackSql(
    `select id::text || '/' || status::text from public.group_invitations where group_id = '${groupId}'::uuid and shareable_version is not null order by shareable_version desc limit 1;`,
  ).trim();
  const [id, status] = row.split("/");
  return { id, status };
}

/** Overwrites a generic invitation's stored expiry to a fixed instant. */
export function stackSetGenericExpiry(
  groupId: string,
  isoInstant: string,
): void {
  runStackSql(
    `update public.group_invitations set expires_at = '${isoInstant}'::timestamptz where group_id = '${groupId}'::uuid and shareable_version is not null;`,
  );
}

/** The targeted invitation row's status as seen by the organizer probe. */
export function stackTargetedStatus(
  groupId: string,
  targetUserId: string,
): string {
  return runStackSql(
    `select status::text from public.group_invitations where group_id = '${groupId}'::uuid and target_user_id = '${targetUserId}'::uuid and shareable_version is null order by created_at desc limit 1;`,
  ).trim();
}

/**
 * A targeted invitation issued through the reshaped 006b overload. The
 * returned row result (token material) is discarded inside the database; the
 * id is resolved from the non-sensitive columns afterwards.
 */
export function stackIssueTargeted(
  organizerId: string,
  groupId: string,
  targetUserId: string,
): string {
  runStackSql(
    withIdentity(
      organizerId,
      `do $$ begin
  perform public.issue_group_invitation('${groupId}'::uuid, '${targetUserId}'::uuid);
end $$;`,
    ),
  );
  return runStackSql(
    `select id::text from public.group_invitations where group_id = '${groupId}'::uuid and target_user_id = '${targetUserId}'::uuid and shareable_version is null order by created_at desc limit 1;`,
  ).trim();
}

/**
 * Issues the generic shareable link through the real compare-and-swap RPC
 * and returns the raw token — used ONLY inside stack-gated specs, held in
 * memory, never logged, never asserted into output, and never persisted in
 * any artifact.
 */
export function stackIssueGenericToken(
  organizerId: string,
  groupId: string,
): string {
  return runStackSql(
    withIdentity(
      organizerId,
      `select token from public.issue_group_invitation('${groupId}'::uuid, (select shareable_invitation_version from public."groups" where id = '${groupId}'::uuid));`,
    ),
  ).trim();
}

/**
 * Removes the 006c continuation and pending-start rows for fixture groups
 * and users. Runs as superuser SQL and MUST run before the group and
 * auth-user teardown: the private rows hold restrict foreign keys to
 * group_invitations and auth.users. Orphan coordinator rows (digest-only,
 * no user or group reference) are intentionally left — they cannot block
 * any teardown and carry no secret material.
 */
export function deleteInvitationContinuationRowsSql(
  groupIds: string[],
  userIds: string[],
): void {
  const list = (values: string[]) =>
    values.map((v) => `'${v}'::uuid`).join(",");
  const matches = (column: string, values: string[]) =>
    values.length > 0 ? `${column} in (${list(values)})` : null;
  const invitationMatch =
    groupIds.length > 0
      ? `invitation_id in (select id from public.group_invitations where group_id in (${list(groupIds)}))`
      : null;
  const continuationWhere = [
    invitationMatch,
    matches("verified_user_id", userIds),
  ]
    .filter((clause) => clause !== null)
    .map((clause, index) =>
      index === 0 ? ` where ${clause}` : ` or ${clause}`,
    )
    .join("");
  const pendingWhere = invitationMatch ? ` where ${invitationMatch}` : "";
  const sql = [
    `delete from private.invitation_continuations${continuationWhere};`,
    `delete from private.invitation_pending_starts${pendingWhere};`,
  ].join("\n");
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      stackDbContainer(),
      "psql",
      "--no-psqlrc",
      "--user",
      "postgres",
      "--dbname",
      "postgres",
      "--set",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "pipe", "pipe"], timeout: 20_000 },
  );
}
