import { beforeEach, expect, it, vi } from "vitest";
const execute = vi.hoisted(() =>
  vi.fn((...args: unknown[]) => {
    void args;
    return Buffer.from("");
  }),
);
vi.mock("node:child_process", () => ({ execFileSync: execute }));
vi.mock("node:fs", () => ({ readFileSync: () => 'project_id = "local-test"' }));
import {
  deleteFixtureGroupsSql,
  deleteInvitationContinuationRowsSql,
} from "./group-stack";
beforeEach(() => execute.mockClear());
it("never runs cleanup without fixture identifiers", () => {
  deleteFixtureGroupsSql([], []);
  expect(execute).not.toHaveBeenCalled();
});
it("never broadens group-only deletes when cleaning a user without groups", () => {
  deleteFixtureGroupsSql([], ["00000000-0000-4000-8000-000000000001"]);
  const sql = execute.mock.calls[0]?.[2] as { input: string };
  for (const statement of sql.input
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    expect(statement).toMatch(/\bwhere\b/i);
  }
  expect(sql.input).toContain(
    "delete from public.group_invitations where false;",
  );
  expect(sql.input).toContain(
    "delete from public.group_assignment_views where giver_id in",
  );
});
it("removes restrictive gifting rows for exact fixture ids before groups and users", () => {
  const groupId = "00000000-0000-4000-8000-000000000001";
  const userId = "00000000-0000-4000-8000-000000000002";
  deleteFixtureGroupsSql([groupId], [userId]);
  const sql = execute.mock.calls[0]?.[2] as { input: string };
  const reactions = `delete from public.group_item_reactions where group_id in ('${groupId}'::uuid) or user_id in ('${userId}'::uuid);`;
  const reservations = `delete from public.group_item_reservations where group_id in ('${groupId}'::uuid) or reserver_id in ('${userId}'::uuid);`;
  expect(sql.input).toContain(reactions);
  expect(sql.input).toContain(reservations);
  const groupDelete = sql.input.indexOf('delete from public."groups"');
  expect(sql.input.indexOf(reactions)).toBeLessThan(groupDelete);
  expect(sql.input.indexOf(reservations)).toBeLessThan(groupDelete);
});
it("keeps gifting cleanup scoped when only group ids are present", () => {
  const groupId = "00000000-0000-4000-8000-000000000001";
  deleteFixtureGroupsSql([groupId], []);
  const sql = execute.mock.calls[0]?.[2] as { input: string };
  expect(sql.input).toContain(
    `delete from public.group_item_reactions where group_id in ('${groupId}'::uuid);`,
  );
  expect(sql.input).toContain(
    `delete from public.group_item_reservations where group_id in ('${groupId}'::uuid);`,
  );
});

it("removes checklist entries before memberships using only exact group/giver/recipient ids", () => {
  const groupId = "00000000-0000-4000-8000-000000000001";
  const userId = "00000000-0000-4000-8000-000000000002";
  deleteFixtureGroupsSql([groupId], [userId]);
  const sql = execute.mock.calls[0]?.[2] as { input: string };
  const checklist = `delete from public.gift_checklist_entries where group_id in ('${groupId}'::uuid) or giver_id in ('${userId}'::uuid) or recipient_id in ('${userId}'::uuid);`;
  expect(sql.input).toContain(checklist);
  expect(sql.input.indexOf(checklist)).toBeLessThan(
    sql.input.indexOf("delete from public.group_members"),
  );
});
it("never executes continuation cleanup without any fixture ids", () => {
  deleteInvitationContinuationRowsSql([], []);
  expect(execute).not.toHaveBeenCalled();
});
it("never deletes unrelated pending starts when cleaning only a fixture user", () => {
  const userId = "00000000-0000-4000-8000-000000000002";
  deleteInvitationContinuationRowsSql([], [userId]);
  const sql = execute.mock.calls[0]?.[2] as { input: string };
  expect(sql.input).toBe(
    `delete from private.invitation_continuations where verified_user_id in ('${userId}'::uuid);\ndelete from private.invitation_pending_starts where false;`,
  );
});
it("scopes continuation and pending cleanup to invitations of exact supplied groups", () => {
  const groupId = "00000000-0000-4000-8000-000000000001";
  deleteInvitationContinuationRowsSql([groupId], []);
  const sql = execute.mock.calls[0]?.[2] as { input: string };
  const filter = ` where invitation_id in (select id from public.group_invitations where group_id in ('${groupId}'::uuid));`;
  expect(sql.input).toBe(
    `delete from private.invitation_continuations${filter}\ndelete from private.invitation_pending_starts${filter}`,
  );
});
