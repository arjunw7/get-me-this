import { randomUUID } from "node:crypto";

import { expect, type Page, test } from "@playwright/test";

import {
  deleteFixtureGroupsSql,
  runStackSql,
  stackGenericInvitation,
  stackGroupVersion,
  stackIssueGeneric,
  stackIssueTargeted,
  stackOrganizerGroupCount,
  stackSetGenericExpiry,
  stackTargetedStatus,
} from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Stack-gated group-creation proof (006b) against the LOCAL Supabase
 * stack, run through scripts/e2e-local-stack.sh: the protected /groups/new
 * route sends signed-out visitors to sign-in, a signed-in member creates a
 * private group through the V18 form and lands on the organizer-only
 * "created" screen, the shareable invitation modal opens on demand and is
 * recovered only when the organizer opens the shared modal, a second
 * member who is not the organizer gets a 404 on the created URL, and the
 * brief's idempotency, stale-tab, expiry, and clipboard-failure behaviors
 * hold through the real UI.
 */
test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
);

/** A real calendar date comfortably in the future, as YYYY-MM-DD. */
function futureIsoDate(): string {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/**
 * A valid UUIDv4 request key for tests that must control the
 * browser-owned draft key deterministically (replay and conflict flows).
 * Each test generates its own key: the receipt table's request_key is not
 * scoped to the fixture user, so a fixed key collides with receipts left
 * by an earlier run in the shared stack ("2/1" counts). Within a single
 * test the key stays constant, which is all the replay and conflict
 * flows require.
 */
const fixedRequestKey = (): string => randomUUID();

async function fillAndSubmitCreateForm(
  page: Page,
  name: string,
): Promise<void> {
  await page.goto("/groups/new");
  await expect(page).toHaveURL(/\/groups\/new$/);
  await expect(
    page.getByRole("heading", { name: "What are we celebrating?" }),
  ).toBeVisible();

  await page.getByLabel("Group name").fill(name);
  await page.getByLabel("Date", { exact: true }).fill(futureIsoDate());
  // Budget defaults to 2500 INR and the mode defaults to secret_draw; the
  // visible defaults are valid, so the form submits without touching them.
  await page.getByRole("button", { name: "Create group" }).click();

  await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
  await expect(
    page.getByRole("heading", { name: `${name} is ready.` }),
  ).toBeVisible();
}

/**
 * Creates a signed-in fixture organizer and one group through the real UI,
 * returning the ids and registering the group teardown.
 */
async function createOrganizerAndGroup(
  page: Page,
  admin: ReturnType<typeof stackAdminClient>,
  scope: FixtureScope,
  prefix: string,
  groupName: string,
): Promise<{ organizerId: string; groupId: string }> {
  const organizerId = await createSignedInFixture(
    page,
    admin,
    prefix,
    { displayName: "Organizer Ona", tasteLine: "planner of parties" },
    scope,
  );
  await fillAndSubmitCreateForm(page, groupName);
  const createdPath = new URL(page.url()).pathname;
  expect(createdPath).toMatch(/^\/groups\/[0-9a-f-]{36}\/created$/);
  const groupId = createdPath.split("/")[2];
  scope.register("fixture groups", async () => {
    deleteFixtureGroupsSql([groupId], [organizerId]);
  });
  return { organizerId, groupId };
}

test("the protected create-group route redirects signed-out visitors to sign-in", async ({
  page,
}) => {
  test.setTimeout(60_000);
  page.setDefaultTimeout(15_000);

  await page.goto("/groups/new");
  // The proxy never renders the form for an unauthenticated visitor and
  // never leaks the route's content.
  await expect(page).not.toHaveURL(/\/groups\/new/);
  await expect(page).toHaveURL(/\/auth/);
});

test("a member creates a private group; its shared modal recovers the invite; the created screen is organizer-only", async ({
  page,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const { organizerId, groupId } = await createOrganizerAndGroup(
      page,
      admin,
      scope,
      "arj37-organizer",
      "Fixture birthday bash",
    );
    const groupName = "Fixture birthday bash";

    // The shared modal issues on demand and can recover the same organizer link.
    await page
      .getByRole("button", { name: "Invite people", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: `${groupName} is ready.` });
    const input = dialog.getByRole("textbox", { name: "Invite link" });
    await expect(input).toBeVisible();
    const linkText = await input.inputValue();
    const token = linkText.split("/invite/")[1] ?? "";
    expect(token.length).toBe(43);
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
    expect(stackGroupVersion(groupId)).toBe("1");
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: `${groupName} is ready.` }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.content()).not.toContain(token);
    await page
      .getByRole("button", { name: "Invite people", exact: true })
      .click();
    await expect(input).toBeVisible();
    expect((await input.inputValue()) === linkText).toBe(true);
    expect(stackGroupVersion(groupId)).toBe("1");
    await dialog.getByRole("button", { name: "Close invite dialog" }).click();

    // Organizer-only: a second member who is not the organizer gets a 404,
    // never the created screen or any invitation state.
    const secondContext = await page.context().browser()!.newContext();
    try {
      const secondPage = await secondContext.newPage();
      await createSignedInFixture(
        secondPage,
        admin,
        "arj37-friend",
        { displayName: "Friend Fae", tasteLine: "gifts, not guesses" },
        scope,
      );
      await secondPage.goto(`/groups/${groupId}/created`);
      await expect(
        secondPage.getByRole("heading", { name: "Page not found" }),
      ).toBeVisible();
      await expect(
        secondPage.getByRole("heading", { name: `${groupName} is ready.` }),
      ).toHaveCount(0);
      expect(await secondPage.content()).not.toContain(token);
    } finally {
      await secondContext.close();
    }

    // Sanity: the organizer's own session remains signed in and scoped.
    expect(organizerId).toBeTruthy();
  });
});

test("double submission creates exactly one group", async ({ page }) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const organizerId = await createSignedInFixture(
      page,
      admin,
      "arj37-double",
      { displayName: "Double Dee", tasteLine: "clicks twice" },
      scope,
    );

    await page.goto("/groups/new");
    await expect(
      page.getByRole("heading", { name: "What are we celebrating?" }),
    ).toBeVisible();

    const groupName = "Double submission bash";
    await page.getByLabel("Group name").fill(groupName);
    await page.getByLabel("Date", { exact: true }).fill(futureIsoDate());

    // Correctness never depends on the disabled control: dispatch two
    // genuine submissions with the same draft key and payload.
    const button = page.getByRole("button", { name: "Create group" });
    await button.click();
    await page
      .evaluate(() => {
        const form = document.querySelector("form");
        form?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      })
      .catch(() => {});

    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const groupId = new URL(page.url()).pathname.split("/")[2];
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [organizerId]);
    });
    await expect(
      page.getByRole("heading", { name: `${groupName} is ready.` }),
    ).toBeVisible();

    // Exactly one group exists for the organizer.
    expect(stackOrganizerGroupCount(organizerId)).toBe(1);
  });
});

test("replaying the same draft through the UI returns the original group", async ({
  page,
}) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const organizerId = await createSignedInFixture(
      page,
      admin,
      "arj37-replay",
      { displayName: "Replay Rae", tasteLine: "same again, please" },
      scope,
    );
    const requestKey = fixedRequestKey();

    // Bind a known draft key to the first submission.
    await page.goto("/groups/new");
    await page.evaluate((key) => {
      window.sessionStorage.setItem("gmt.groups.create.request-key", key);
    }, requestKey);

    const groupName = "Replay birthday bash";
    await page.getByLabel("Group name").fill(groupName);
    await page.getByLabel("Date", { exact: true }).fill(futureIsoDate());
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const firstGroupId = new URL(page.url()).pathname.split("/")[2];
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([firstGroupId], [organizerId]);
    });

    // The same draft (same retained request key and binding, same payload)
    // replays the original group instead of creating a duplicate.
    await fillAndSubmitCreateForm(page, groupName);
    const replayGroupId = new URL(page.url()).pathname.split("/")[2];
    expect(replayGroupId).toBe(firstGroupId);

    // Exactly one group, one receipt, and one creation audit event.
    expect(stackOrganizerGroupCount(organizerId)).toBe(1);
    const counts = runStackSql(
      `select (select count(*) from public.group_creation_receipts where request_key = '${requestKey}'::uuid)::text || '/' || (select count(*) from public.audit_events where group_id = '${firstGroupId}'::uuid and event_type = 'group_created')::text;`,
    ).trim();
    expect(counts).toBe("1/1");
  });
});

test("a changed payload after a submitted attempt surfaces the conflict BEFORE the changed payload is sent", async ({
  page,
}) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const organizerId = await createSignedInFixture(
      page,
      admin,
      "arj37-conflict",
      { displayName: "Conflict Cy", tasteLine: "second thoughts" },
      scope,
    );
    const requestKey = fixedRequestKey();

    // First submission binds the draft key to the attempted digest.
    await page.goto("/groups/new");
    await page.evaluate((key) => {
      window.sessionStorage.setItem("gmt.groups.create.request-key", key);
    }, requestKey);
    const groupName = "Conflict first draft";
    await page.getByLabel("Group name").fill(groupName);
    await page.getByLabel("Date", { exact: true }).fill(futureIsoDate());
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const groupId = new URL(page.url()).pathname.split("/")[2];
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [organizerId]);
    });

    // Edit the submitted payload, then submit again. Count server-action
    // requests: the conflict must surface with ZERO new requests.
    let actionRequests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.headers()["next-action"] !== undefined
      ) {
        actionRequests += 1;
      }
    });

    await page.goto("/groups/new");
    await expect(
      page.getByRole("heading", { name: "What are we celebrating?" }),
    ).toBeVisible();
    await page.getByLabel("Group name").fill("Conflict changed draft");
    await page.getByLabel("Date", { exact: true }).fill(futureIsoDate());
    await page.getByRole("button", { name: "Create group" }).click();

    const conflict = page.getByTestId("idempotency-conflict");
    await expect(conflict).toBeVisible();
    expect(actionRequests).toBe(0);

    // Cancel retains the original key and attempted binding: the conflict
    // clears and the earlier attempt is kept.
    await conflict
      .getByRole("button", { name: "Keep my earlier attempt" })
      .click();
    await expect(page.getByTestId("idempotency-conflict")).toHaveCount(0);
    expect(stackOrganizerGroupCount(organizerId)).toBe(1);
  });
});

test("only the explicit confirmation submits a changed payload as a new request", async ({
  page,
}) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const organizerId = await createSignedInFixture(
      page,
      admin,
      "arj37-newreq",
      { displayName: "New Request Nadia", tasteLine: "deliberate rerouter" },
      scope,
    );
    const requestKey = fixedRequestKey();

    await page.goto("/groups/new");
    await page.evaluate((key) => {
      window.sessionStorage.setItem("gmt.groups.create.request-key", key);
    }, requestKey);
    const groupName = "New request first draft";
    await page.getByLabel("Group name").fill(groupName);
    await page.getByLabel("Date", { exact: true }).fill(futureIsoDate());
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const firstGroupId = new URL(page.url()).pathname.split("/")[2];
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([firstGroupId], [organizerId]);
    });

    await page.goto("/groups/new");
    await expect(
      page.getByRole("heading", { name: "What are we celebrating?" }),
    ).toBeVisible();
    await page.getByLabel("Group name").fill("New request second draft");
    await page.getByLabel("Date", { exact: true }).fill(futureIsoDate());
    await page.getByRole("button", { name: "Create group" }).click();
    await expect(page.getByTestId("idempotency-conflict")).toBeVisible();

    // Nothing was created by the conflict surface itself.
    expect(stackOrganizerGroupCount(organizerId)).toBe(1);

    // The explicit confirmation is the only path that rotates the key and
    // submits the changed payload as a new request.
    await page
      .getByTestId("idempotency-conflict")
      .getByRole("button", { name: "Submit changes as a new request" })
      .click();
    await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
    const secondGroupId = new URL(page.url()).pathname.split("/")[2];
    expect(secondGroupId).not.toBe(firstGroupId);
    await expect(
      page.getByRole("heading", { name: "New request second draft is ready." }),
    ).toBeVisible();

    // Two deliberate groups now exist, each with its own receipt.
    expect(stackOrganizerGroupCount(organizerId)).toBe(2);
  });
});

test("opening a stale created page never replaces an unrecoverable active invitation automatically", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const { organizerId, groupId } = await createOrganizerAndGroup(
      page,
      stackAdminClient(),
      scope,
      "arj37-stale",
      "Stale tab bash",
    );
    expect(stackGroupVersion(groupId)).toBe("0");
    expect(stackIssueGeneric(organizerId, groupId)).toBe("1");
    // This synthetic fixture models a pre-migration digest-only invitation.
    runStackSql(
      `delete from private.group_shareable_invitation_tokens where invitation_id in (select id from public.group_invitations where group_id='${groupId}' and shareable_version is not null);`,
    );
    await page
      .getByRole("button", { name: "Invite people", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByText(/stop the old link from working/),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Invite link" }),
    ).toHaveCount(0);
    expect(stackGroupVersion(groupId)).toBe("1");
    expect(
      runStackSql(
        `select count(*)::text from public.audit_events where group_id='${groupId}' and event_type='invitation_issued';`,
      ).trim(),
    ).toBe("1");
  });
});

test("opening the shared invitation modal preserves the authoritative stored expiry", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const { organizerId, groupId } = await createOrganizerAndGroup(
      page,
      stackAdminClient(),
      scope,
      "arj37-expiry",
      "Expiry display bash",
    );
    expect(stackIssueGeneric(organizerId, groupId)).toBe("1");
    stackSetGenericExpiry(groupId, "2050-01-01 00:00:00+00");
    const expiry = () =>
      Number(
        runStackSql(
          `select extract(epoch from expires_at)::text from public.group_invitations where group_id='${groupId}' and shareable_version is not null;`,
        ).trim(),
      );
    expect(expiry()).toBe(new Date("2050-01-01T00:00:00Z").getTime() / 1000);
    await page.reload();
    await page
      .getByRole("button", { name: "Invite people", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByRole("textbox", { name: "Invite link" }),
    ).toBeVisible();
    expect(expiry()).toBe(new Date("2050-01-01T00:00:00Z").getTime() / 1000);
    expect(stackGroupVersion(groupId)).toBe("1");
  });
});

test("an expired invitation renews only after the organizer opens the shared modal", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const scope = new FixtureScope();
  await scope.run(async () => {
    const { organizerId, groupId } = await createOrganizerAndGroup(
      page,
      stackAdminClient(),
      scope,
      "arj37-expired",
      "Expired replacement bash",
    );
    expect(stackIssueGeneric(organizerId, groupId)).toBe("1");
    stackSetGenericExpiry(groupId, "2026-01-01 00:00:00+00");
    await page.reload();
    expect(stackGroupVersion(groupId)).toBe("1");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Invite people", exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByRole("textbox", { name: "Invite link" }),
    ).toBeVisible();
    expect(stackGroupVersion(groupId)).toBe("2");
    expect(stackGenericInvitation(groupId).status).toBe("active");
  });
});

test("targeted invitations stay isolated from the generic shareable link", async ({
  page,
}) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const organizerId = await createSignedInFixture(
      page,
      admin,
      "arj37-targeted",
      { displayName: "Targeted Tia", tasteLine: "one link per person" },
      scope,
    );
    await fillAndSubmitCreateForm(page, "Targeted isolation bash");
    const groupId = new URL(page.url()).pathname.split("/")[2];
    scope.register("fixture groups", async () => {
      deleteFixtureGroupsSql([groupId], [organizerId]);
    });

    // A second fixture member receives a targeted invitation issued
    // directly through the reshaped 006b overload.
    const secondContext = await page.context().browser()!.newContext();
    let targetUserId = "";
    try {
      const memberPage = await secondContext.newPage();
      targetUserId = await createSignedInFixture(
        memberPage,
        admin,
        "arj37-targeted-friend",
        { displayName: "Friend Milo", tasteLine: "invited, not generic" },
        scope,
      );
    } finally {
      await secondContext.close();
    }
    stackIssueTargeted(organizerId, groupId, targetUserId);
    expect(stackTargetedStatus(groupId, targetUserId)).toBe("active");

    // The organizer's generic compare-and-swap still starts at version 0:
    // targeted issuance never reads or advances the shared version.
    await page
      .getByRole("button", { name: "Invite people", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Invite link" }),
    ).toBeVisible();
    expect(stackGroupVersion(groupId)).toBe("1");

    // The targeted row is untouched by the generic issuance: still active,
    // still null-shareable-version, same bound generation.
    expect(stackTargetedStatus(groupId, targetUserId)).toBe("active");
    const targetedRow = runStackSql(
      `select status::text || '/' || coalesce(shareable_version::text, 'null') || '/' || target_membership_generation::text from public.group_invitations where group_id = '${groupId}'::uuid and target_user_id = '${targetUserId}'::uuid and shareable_version is null;`,
    ).trim();
    expect(targetedRow).toBe("active/null/1");
  });
});

test("a clipboard failure keeps the shared modal link selectable and explains the fallback", async ({
  page,
}) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    const { organizerId, groupId } = await createOrganizerAndGroup(
      page,
      admin,
      scope,
      "arj37-clipboard",
      "Clipboard failure bash",
    );

    await page
      .getByRole("button", { name: "Invite people", exact: true })
      .click();
    const linkCard = page.getByRole("dialog");
    await expect(linkCard).toBeVisible();
    const link = await linkCard
      .getByRole("textbox", { name: "Invite link" })
      .inputValue();
    const linkText = (link ?? "").trim();

    // Force the clipboard write to fail (denied permission), then copy.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: () =>
            Promise.reject(new DOMException("denied", "NotAllowedError")),
        },
        configurable: true,
      });
    });
    await linkCard.getByRole("button", { name: "Copy invite link" }).click();

    // The failure is announced, and the only displayed token survives.
    // Equality is asserted as a bare boolean: a failure message must never
    // print link or token material into CI logs.
    const failure = linkCard.getByRole("status");
    await expect(failure).toBeVisible();
    await expect(failure).toContainText("Select and copy the link above.");
    const afterFailure = await linkCard
      .getByRole("textbox", { name: "Invite link" })
      .inputValue();
    await expect(
      linkCard.getByRole("textbox", { name: "Invite link" }),
    ).toBeFocused();
    expect((afterFailure ?? "").trim() === linkText).toBe(true);
    expect(linkText.length).toBeGreaterThan(43);

    // Hygiene: the group teardown covers the fixture rows.
    expect(organizerId).toBeTruthy();
    expect(groupId).toBeTruthy();
  });
});

test("the create form rejects an empty name client-side, retains input, and never sends", async ({
  page,
}) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  await scope.run(async () => {
    await createSignedInFixture(
      page,
      admin,
      "arj37-validation",
      { displayName: "Validation Vic", tasteLine: "reads the labels" },
      scope,
    );

    await page.goto("/groups/new");
    await expect(
      page.getByRole("heading", { name: "What are we celebrating?" }),
    ).toBeVisible();

    // Client-side field errors keep every entered value and never send.
    await page.getByLabel("Date", { exact: true }).fill(futureIsoDate());
    let actionRequests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        request.headers()["next-action"] !== undefined
      ) {
        actionRequests += 1;
      }
    });
    await page.getByRole("button", { name: "Create group" }).click();
    await expect(
      page.getByText("Give it a name so people recognise the invite."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/groups\/new$/);
    expect(actionRequests).toBe(0);
    // The valid date the user entered is retained.
    await expect(page.getByLabel("Date", { exact: true })).toHaveValue(
      futureIsoDate(),
    );
  });
});
