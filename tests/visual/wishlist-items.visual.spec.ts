import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import {
  createSignedInFixture,
  fixtureWishlistId,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";
import { wishlistControl } from "../helpers/wishlist-control-client";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const CANDIDATE_DIR = join(process.cwd(), "test-results", "arj28-candidates");

async function attributeAction(
  page: Page,
  caseId: string,
  participant: "first" | "second" = "first",
) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      await route.continue({
        headers: {
          ...request.headers(),
          "x-arj28-case": caseId,
          "x-arj28-participant": participant,
        },
      });
      return;
    }
    await route.continue();
  });
}

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires local Supabase and the loopback wishlist test controller",
);

test("manual wishlist create/edit/delete states yield matched responsive candidates and clean axe scans", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(20_000);
  mkdirSync(CANDIDATE_DIR, { recursive: true });
  const admin = stackAdminClient();
  const scope = new FixtureScope();
  const axeStates: Array<{ state: string; violationIds: string[] }> = [];
  const viewport = testInfo.project.name;
  const capture = async (state: string) => {
    const file = `arj28-${state}-${viewport}.png`;
    await page.screenshot({
      path: join(CANDIDATE_DIR, file),
      fullPage: true,
      animations: "disabled",
    });
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    axeStates.push({
      state,
      violationIds: axe.violations.map((violation) => violation.id),
    });
    expect(axe.violations.map(({ id, impact }) => ({ id, impact }))).toEqual(
      [],
    );
    const undersized = await page
      .locator(
        "button:visible, a[href]:visible, input:not([type=radio]):visible, select:visible, textarea:visible",
      )
      .evaluateAll((nodes) =>
        nodes
          .map((node) => ({
            tag: node.tagName,
            height: Math.round(node.getBoundingClientRect().height),
          }))
          .filter((node) => node.height < 44),
      );
    expect(undersized).toEqual([]);
    const radioLabels = await page
      .locator('label:has(input[type="radio"]):visible')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => Math.round(node.getBoundingClientRect().height))
          .filter((height) => height < 44),
      );
    expect(radioLabels).toEqual([]);
  };
  const caseId = randomUUID();
  try {
    const userId = await createSignedInFixture(
      page,
      admin,
      "arj28-visual",
      { displayName: "Ada", tasteLine: "currently in my tiny-luxuries era" },
      scope,
    );
    const wishlistId = await fixtureWishlistId(admin, userId);

    await page.goto("/wishlist/items/new");
    // Since 005f the add route opens with the extraction flow; the manual
    // composition is the deliberate manual-entry state of that flow.
    await expect(
      page.getByRole("heading", {
        name: "Drop the link. We’ll do the nosy part.",
      }),
    ).toBeVisible();
    await capture("add-initial");
    await page
      .getByRole("button", { name: "No link? Add it manually" })
      .click();
    await expect(page.getByLabel("Item name")).toBeVisible();
    await capture("manual-clean");
    await page.getByLabel("Item name").fill("ARJ-28 candidate lamp");
    await page.getByLabel("Shop (optional)").fill("Candidate Shop");
    await page.getByLabel("Price").fill("24.99");
    await page
      .getByRole("combobox", { name: "Currency", exact: true })
      .fill("INR");
    await page
      .getByRole("combobox", { name: "Currency", exact: true })
      .press("Enter");
    await page
      .getByLabel("Link (optional)")
      .fill("https://arj28-candidate.invalid/lamp");
    await page
      .getByLabel("Note (optional)")
      .fill("Synthetic candidate fixture only.");
    await page.getByRole("radio", { name: "Really want" }).check();
    await capture("manual-prefilled");

    await page.getByLabel("Item name").fill("");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page.getByText("Enter a title.")).toBeVisible();
    await capture("validation");

    // The reviewed 005d append RPC resolves sort-key overflow by
    // renumbering the owner's rows and saving, so a create can no longer
    // fail that way. The designed save-failure state is exercised through
    // the guarded edit path after the successful create below.

    await page.goto("/wishlist/items/new");
    await page
      .getByRole("button", { name: "No link? Add it manually" })
      .click();
    const submissionId = await page
      .locator('input[name="submissionId"]')
      .inputValue();
    const conflict = await admin
      .from("wishlist_items")
      .insert({
        wishlist_id: wishlistId,
        owner_id: userId,
        title: "Already saved candidate",
        sort_position: 1,
        client_submission_id: submissionId,
      })
      .select("id")
      .single();
    expect(conflict.error).toBeNull();
    await page.getByLabel("Item name").fill("Changed candidate draft");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(
      page.getByText(/This entry was already saved with different details/i),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Edit saved item" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start over" }),
    ).toBeVisible();
    await capture("submission-conflict");
    await admin
      .from("wishlist_items")
      .delete()
      .eq("owner_id", userId)
      .eq("client_submission_id", submissionId);

    await page.goto("/wishlist/items/new");
    await page
      .getByRole("button", { name: "No link? Add it manually" })
      .click();
    await page.getByLabel("Item name").fill("ARJ-28 candidate lamp");
    await page.getByLabel("Price").fill("24.99");
    await page
      .getByRole("combobox", { name: "Currency", exact: true })
      .fill("INR");
    await page
      .getByRole("combobox", { name: "Currency", exact: true })
      .press("Enter");
    await page
      .getByLabel("Link (optional)")
      .fill("https://arj28-candidate.invalid/lamp");
    await page.getByRole("button", { name: "Add item" }).click();
    await expect(page).toHaveURL(/\/wishlist\?item=added$/);
    const created = await admin
      .from("wishlist_items")
      .select("id")
      .eq("owner_id", userId)
      .eq("title", "ARJ-28 candidate lamp")
      .single();
    expect(created.error).toBeNull();
    // success: the ADD-success notice on /wishlist with the saved item
    // present, per the 005f visual reference mapping (not the delete
    // notice). Captured before the edit flow navigates away.
    await expect(
      page.getByRole("status").getByText("Item added to your wishlist."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Edit ARJ-28 candidate lamp" }),
    ).toBeVisible();
    await capture("success");
    await page
      .getByRole("link", { name: "Edit ARJ-28 candidate lamp" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Edit item" }),
    ).toBeVisible();
    await capture("edit");

    // save-failure: the row's price pair is changed while the save action
    // is held at the after-edit-read-before-update barrier, so the guarded
    // update matches zero rows and the form reports the designed retry
    // banner without writing.
    await wishlistControl.register(caseId);
    await wishlistControl.arm(caseId, "after-edit-read-before-update", 1);
    await attributeAction(page, caseId);
    const staleSave = page
      .getByRole("button", { name: "Save changes" })
      .click();
    await wishlistControl.wait(caseId, "after-edit-read-before-update");
    const stalePair = await admin
      .from("wishlist_items")
      .update({
        original_amount_minor: 5100,
        original_currency: "USD",
        converted_amount_minor: null,
        converted_currency: null,
        conversion_rate_source: null,
        conversion_rate_at: null,
      })
      .eq("owner_id", userId)
      .eq("id", created.data!.id);
    expect(stalePair.error).toBeNull();
    await wishlistControl.release(caseId, "after-edit-read-before-update");
    await staleSave;
    await expect(
      page.getByText(/This item changed while you were editing/i),
    ).toContainText("Reload the item before trying again");
    await capture("save-failure");
    await page.unroute("**/*");

    await page.getByRole("button", { name: "Delete item" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture("delete-confirm");

    await wishlistControl.register(caseId);
    await wishlistControl.arm(
      caseId,
      "postgrest-delete-pre-dispatch-failure",
      1,
      created.data!.id,
      true,
    );
    await attributeAction(page, caseId);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete item" })
      .click();
    await expect(
      page
        .getByRole("dialog")
        .getByText(/couldn’t confirm whether the item was removed/i),
    ).toBeVisible();
    await capture("delete-uncertain");
    const transportProof = await wishlistControl.events(caseId);
    expect(transportProof.failed).toBe(false);
    expect(
      transportProof.arrivals.filter(
        (arrival) => arrival.stage === "postgrest-delete-pre-dispatch-failure",
      ),
    ).toHaveLength(1);
    expect(
      transportProof.observations.some(
        (event) =>
          event.kind === "local-rest" &&
          event.phase === "attempt" &&
          event.targetId === created.data!.id,
      ),
    ).toBe(true);

    await page.getByRole("button", { name: "Check status" }).click();
    await expect(
      page.getByRole("button", { name: "Retry delete" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Retry delete" }).click();
    await expect(page).toHaveURL(/\/wishlist\?item=deleted$/);
    await expect(page.getByRole("heading", { name: "Ada" })).toBeVisible();
    await expect(
      page.getByRole("status").getByText("Item removed from your wishlist."),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Your wishlist is empty" }),
    ).toBeVisible();
    expect(axeStates).toHaveLength(10);
    writeFileSync(
      join(CANDIDATE_DIR, `axe-${viewport}.json`),
      `${JSON.stringify({ viewport, states: axeStates }, null, 2)}\n`,
      { mode: 0o600 },
    );
  } finally {
    await wishlistControl.clear(caseId).catch(() => undefined);
    await scope.cleanup();
  }
});
