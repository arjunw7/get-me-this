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
 * "created" screen, the shareable invite link is shown exactly once and is
 * never recoverable after the one display (reload loses it), a second
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
 * A fixed, valid UUIDv4 request key for tests that must control the
 * browser-owned draft key deterministically (replay and conflict flows).
 */
const FIXED_REQUEST_KEY = "d4b1c7a2-1111-4222-8333-444455556666";

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
  await page.getByLabel("Date").fill(futureIsoDate());
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

test("a member creates a private group; the invite link is shown exactly once; the created screen is organizer-only", async ({
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

    // First issuance: the token link is displayed exactly once. Assertions
    // below use only lengths and boolean shape checks: a failure message
    // must never print link or token material into CI logs.
    await page.getByRole("button", { name: "Create invite link" }).click();
    const linkCard = page.getByTestId("invite-link-card");
    await expect(linkCard).toBeVisible();
    const link = await linkCard.locator(".select-all").first().textContent();
    const linkText = (link ?? "").trim();
    const token = linkText.includes("/invite/")
      ? (linkText.split("/invite/")[1] ?? "")
      : "";
    expect(linkText.length).toBeGreaterThan(43);
    expect(token.length).toBe(43);
    expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);

    // The one-time display is the only display: a reload shows the
    // active-link-lost state and never the token again.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: `${groupName} is ready.` }),
    ).toBeVisible();
    await expect(page.getByTestId("invite-link-card")).toHaveCount(0);
    await expect(page.getByTestId("active-link-lost")).toBeVisible();
    expect(await page.content()).not.toContain(token);

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
    await page.getByLabel("Date").fill(futureIsoDate());

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

    // Bind a known draft key to the first submission.
    await page.goto("/groups/new");
    await page.evaluate((key) => {
      window.sessionStorage.setItem("gmt.groups.create.request-key", key);
    }, FIXED_REQUEST_KEY);

    const groupName = "Replay birthday bash";
    await page.getByLabel("Group name").fill(groupName);
    await page.getByLabel("Date").fill(futureIsoDate());
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
      `select (select count(*) from public.group_creation_receipts where request_key = '${FIXED_REQUEST_KEY}'::uuid)::text || '/' || (select count(*) from public.audit_events where group_id = '${firstGroupId}'::uuid and event_type = 'group_created')::text;`,
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

    // First submission binds the draft key to the attempted digest.
    await page.goto("/groups/new");
    await page.evaluate((key) => {
      window.sessionStorage.setItem("gmt.groups.create.request-key", key);
    }, FIXED_REQUEST_KEY);
    const groupName = "Conflict first draft";
    await page.getByLabel("Group name").fill(groupName);
    await page.getByLabel("Date").fill(futureIsoDate());
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
    await page.getByLabel("Date").fill(futureIsoDate());
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

    await page.goto("/groups/new");
    await page.evaluate((key) => {
      window.sessionStorage.setItem("gmt.groups.create.request-key", key);
    }, FIXED_REQUEST_KEY);
    const groupName = "New request first draft";
    await page.getByLabel("Group name").fill(groupName);
    await page.getByLabel("Date").fill(futureIsoDate());
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
    await page.getByLabel("Date").fill(futureIsoDate());
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

test("a stale tab refreshes the projection and never retries issuance automatically", async ({
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
      "arj37-stale",
      "Stale tab bash",
    );

    // Another tab issues first: this tab still projects version 0, so its
    // expected version is stale.
    expect(stackGroupVersion(groupId)).toBe("0");
    const otherTabVersion = stackIssueGeneric(organizerId, groupId);
    expect(otherTabVersion).toBe("1");

    // No reload: this tab still holds the stale version 0 projection. Its
    // issuance is stale and the refreshed state decides the display. No
    // token is returned and no automatic retry happens.
    await page.getByRole("button", { name: "Create invite link" }).click();

    await expect(page.getByTestId("active-link-lost")).toBeVisible();
    await expect(page.getByTestId("stale-version-note")).toBeVisible();
    await expect(page.getByTestId("invite-link-card")).toHaveCount(0);
    // The stale round-trip changed nothing: still exactly one generic row
    // at the other tab's version, and no extra issuance audit.
    expect(stackGroupVersion(groupId)).toBe("1");
    const audits = runStackSql(
      `select count(*)::text from public.audit_events where group_id = '${groupId}'::uuid and event_type = 'invitation_issued';`,
    ).trim();
    expect(audits).toBe("1");
  });
});

test("the created screen shows the authoritative stored expiry", async ({
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
      "arj37-expiry",
      "Expiry display bash",
    );

    // Another session issues the link; the stored expiry is then pinned to
    // a fixed instant so the display is checkable deterministically.
    expect(stackIssueGeneric(organizerId, groupId)).toBe("1");
    stackSetGenericExpiry(groupId, "2050-01-01 00:00:00+00");

    await page.reload();
    const lostCard = page.getByTestId("active-link-lost");
    await expect(lostCard).toBeVisible();
    await expect(page.getByTestId("invite-link-card")).toHaveCount(0);

    // The rendered expiry is the stored value formatted with the pinned
    // deterministic locale and zone (en-IN, Asia/Kolkata) — 00:00 UTC is
    // 05:30 India time. The same formatter computes the expectation here.
    const expectedExpiry = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date("2050-01-01T00:00:00Z"));
    await expect(lostCard).toContainText(expectedExpiry);
  });
});

test("an issued-expired link requires confirmation before its replacement", async ({
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
      "arj37-expired",
      "Expired replacement bash",
    );

    // The stored-active generic row is pinned to the past: the projection
    // must honestly report issued_expired, not collapse into another state.
    expect(stackIssueGeneric(organizerId, groupId)).toBe("1");
    stackSetGenericExpiry(groupId, "2026-01-01 00:00:00+00");

    await page.reload();
    const expiredCard = page.getByTestId("issued-expired");
    await expect(expiredCard).toBeVisible();
    await expect(page.getByTestId("invite-link-card")).toHaveCount(0);

    // The replacement is confirmation-gated even though the old token is
    // already invalid.
    await expiredCard
      .getByRole("button", { name: "Create a new invite link" })
      .click();
    const confirmation = page.getByTestId("replacement-confirmation");
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText(
      "the expired link will remain unusable",
    );

    // No issuance happened before the confirmation.
    expect(stackGroupVersion(groupId)).toBe("1");

    await confirmation
      .getByRole("button", { name: "Yes, create a new link" })
      .click();
    const linkCard = page.getByTestId("invite-link-card");
    await expect(linkCard).toBeVisible();
    expect(stackGroupVersion(groupId)).toBe("2");
    const generic = stackGenericInvitation(groupId);
    expect(generic.status).toBe("active");
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
    await page.getByRole("button", { name: "Create invite link" }).click();
    await expect(page.getByTestId("invite-link-card")).toBeVisible();
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

test("a clipboard failure keeps the one-time link selectable and explains the fallback", async ({
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

    await page.getByRole("button", { name: "Create invite link" }).click();
    const linkCard = page.getByTestId("invite-link-card");
    await expect(linkCard).toBeVisible();
    const link = await linkCard.locator(".select-all").first().textContent();
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
    const failure = linkCard.getByRole("alert");
    await expect(failure).toBeVisible();
    await expect(failure).toContainText("copy it manually");
    const afterFailure = await linkCard
      .locator(".select-all")
      .first()
      .textContent();
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
    await page.getByLabel("Date").fill(futureIsoDate());
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
    await expect(page.getByLabel("Date")).toHaveValue(futureIsoDate());
  });
});
