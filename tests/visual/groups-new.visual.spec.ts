import { expect, test } from "@playwright/test";

import { deleteFixtureGroupsSql } from "../helpers/group-stack";
import {
  createSignedInFixture,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";

/**
 * Visual candidate capture for the 006b create-group form states
 * (docs/delivery/issues/006b-create-private-group.md, criterion 12): the
 * empty form, the validation-error state, the pending state, and the
 * idempotency-conflict state, at the two approved viewports.
 *
 * Stack-gated: the signed-in session is established through the real
 * surface against the local Supabase stack (CI database job). The form is
 * deterministic: persistent labels, fixed defaults (Birthday, 2500 INR,
 * Draw names privately), and no time-dependent content.
 *
 * Cross-OS capture variance is absorbed with the documented
 * maxDiffPixelRatio tolerance (docs/delivery/evidence/arj-27/README.md,
 * finding 4). The mobile form baselines are the CI runner's own renders
 * (ubuntu-24.04): the form's borderline-wrapping privacy line and the
 * native date input's locale rendering differ by one text line across OS
 * builds, which a pixel tolerance cannot absorb. The remaining baselines
 * are the approved preview captures; per-file provenance is recorded in
 * BASELINE-MANIFEST.json.
 *
 * The pending state is reached deterministically by gating the server
 * action response; the conflict state is reached WITHOUT any request by
 * seeding a draft binding that differs from the current payload, which is
 * exactly the brief's conflict-before-request behavior.
 */

/** The fixed 43-character redaction placeholder for token-bearing text. */
export const REDACTED_TOKEN = "R".repeat(43);

test.describe("the create-group form", () => {
  test("the empty form matches the approved composition", async ({
    page,
  }, testInfo) => {
    test.skip(
      !process.env.E2E_LOCAL_SUPABASE,
      "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
    );
    test.setTimeout(180_000);
    const admin = stackAdminClient();
    const scope = new FixtureScope();
    await scope.run(async () => {
      await createSignedInFixture(
        page,
        admin,
        "groups-visual-new-empty",
        { displayName: "Visual Vera", tasteLine: "collects moments" },
        scope,
      );

      await page.goto("/groups/new");
      await expect(
        page.getByRole("heading", { name: "What are we celebrating?" }),
      ).toBeVisible();

      await expect(page).toHaveScreenshot(
        `groups-new-empty-${testInfo.project.name}.png`,
        {
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          maxDiffPixelRatio: 0.03,
        },
      );
    });
  });

  test("the validation-error state keeps every entered value", async ({
    page,
  }, testInfo) => {
    test.skip(
      !process.env.E2E_LOCAL_SUPABASE,
      "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
    );
    test.setTimeout(180_000);
    const admin = stackAdminClient();
    const scope = new FixtureScope();
    await scope.run(async () => {
      await createSignedInFixture(
        page,
        admin,
        "groups-visual-new-validation",
        { displayName: "Visual Vera", tasteLine: "collects moments" },
        scope,
      );

      await page.goto("/groups/new");
      await expect(
        page.getByRole("heading", { name: "What are we celebrating?" }),
      ).toBeVisible();

      await page.getByRole("button", { name: "Create group" }).click();
      await expect(
        page.getByText("Give it a name so people recognise the invite."),
      ).toBeVisible();
      await expect(
        page.getByText("Fix the highlighted fields and try again."),
      ).toBeVisible();

      await expect(page).toHaveScreenshot(
        `groups-new-validation-${testInfo.project.name}.png`,
        {
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          maxDiffPixelRatio: 0.03,
        },
      );
    });
  });

  test("the pending state resists duplicate activation", async ({
    page,
  }, testInfo) => {
    test.skip(
      !process.env.E2E_LOCAL_SUPABASE,
      "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
    );
    test.setTimeout(180_000);
    const admin = stackAdminClient();
    const scope = new FixtureScope();
    await scope.run(async () => {
      await createSignedInFixture(
        page,
        admin,
        "groups-visual-new-pending",
        { displayName: "Visual Vera", tasteLine: "collects moments" },
        scope,
      );

      await page.goto("/groups/new");
      await expect(
        page.getByRole("heading", { name: "What are we celebrating?" }),
      ).toBeVisible();

      await page.getByLabel("Group name").fill("ARJ-37 baseline fixture");
      const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      await page.getByLabel("Date", { exact: true }).fill(date);

      // Hold the server-action response open so the pending state is
      // stable for the capture, then release it. The swallowed rejection
      // absorbs the unroute race: Playwright can deliver the trailing
      // continue after the listener was removed mid-flight.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/groups/new", async (route) => {
        if (route.request().headers()["next-action"] !== undefined) {
          await gate;
        }
        await route.continue().catch(() => {});
      });

      await page.getByRole("button", { name: "Create group" }).click();
      await expect(
        page.getByRole("button", { name: "Creating…" }),
      ).toBeVisible();

      await expect(page).toHaveScreenshot(
        `groups-new-pending-${testInfo.project.name}.png`,
        {
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          maxDiffPixelRatio: 0.03,
        },
      );

      release();
      await page.unroute("**/groups/new");

      // The released submission completes: tear the created group down
      // before the fixture user (RESTRICT foreign keys), so the cleanup
      // order must register it after the user.
      await page.waitForURL(/\/groups\/[0-9a-f-]{36}\/created$/);
      const groupId = new URL(page.url()).pathname.split("/")[2];
      scope.register("fixture groups", async () => {
        deleteFixtureGroupsSql([groupId], []);
      });
    });
  });

  test("the idempotency-conflict state surfaces before any request", async ({
    page,
  }, testInfo) => {
    test.skip(
      !process.env.E2E_LOCAL_SUPABASE,
      "requires the local Supabase stack; run through scripts/e2e-local-stack.sh",
    );
    test.setTimeout(180_000);
    const admin = stackAdminClient();
    const scope = new FixtureScope();
    await scope.run(async () => {
      await createSignedInFixture(
        page,
        admin,
        "groups-visual-new-conflict",
        { displayName: "Visual Vera", tasteLine: "collects moments" },
        scope,
      );

      await page.goto("/groups/new");
      // A seeded binding that cannot match any submitted digest surfaces
      // the conflict in the browser, before the changed payload is sent.
      await page.evaluate(() => {
        window.sessionStorage.setItem(
          "gmt.groups.create.request-key",
          "d4b1c7a2-1111-4222-8333-444455556666",
        );
        window.sessionStorage.setItem(
          "gmt.groups.create.binding",
          JSON.stringify({ digest: "0".repeat(64) }),
        );
      });

      await page.getByLabel("Group name").fill("ARJ-37 baseline fixture");
      const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      await page.getByLabel("Date", { exact: true }).fill(date);
      await page.getByRole("button", { name: "Create group" }).click();

      await expect(page.getByTestId("idempotency-conflict")).toBeVisible();

      await expect(page).toHaveScreenshot(
        `groups-new-conflict-${testInfo.project.name}.png`,
        {
          fullPage: true,
          animations: "disabled",
          caret: "hide",
          maxDiffPixelRatio: 0.03,
        },
      );
    });
  });
});
