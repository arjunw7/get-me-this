import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  FixtureScope,
  stackAdminClient,
  createFixtureUser,
  deleteFixtureUser,
  fixtureEmail,
  seedWishlistItems,
} from "../helpers/local-stack";
import {
  deleteFixtureGroupsSql,
  runStackSql,
  withIdentity,
} from "../helpers/group-stack";

test.skip(
  !process.env.E2E_LOCAL_SUPABASE,
  "requires the local Supabase stack and Mailpit",
);

import { mailpitLogin } from "../helpers/mailpit-signin";

type Mode = "secret_draw" | "gift_everyone" | "wishlist_only";
async function capture(page: Page, name: string) {
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

const cases: { name: string; modes: Mode[] }[] = [
  { name: "no groups", modes: [] },
  { name: "one Secret draw group", modes: ["secret_draw"] },
  { name: "one Gift everyone group", modes: ["gift_everyone"] },
  { name: "one Wishlist only group", modes: ["wishlist_only"] },
  {
    name: "multiple Secret draw groups",
    modes: ["secret_draw", "secret_draw"],
  },
  {
    name: "multiple Gift everyone groups",
    modes: ["gift_everyone", "gift_everyone"],
  },
  {
    name: "multiple Wishlist only groups",
    modes: ["wishlist_only", "wishlist_only"],
  },
  {
    name: "multiple groups with mixed modes",
    modes: ["secret_draw", "gift_everyone", "wishlist_only"],
  },
];
for (const scenario of cases)
  test(scenario.name, async ({ page }) => {
    test.setTimeout(300_000);
    const admin = stackAdminClient();
    const scope = new FixtureScope();
    await scope.run(async () => {
      const users: string[] = [];
      const email = fixtureEmail("matrix-owner");
      for (let index = 0; index < (scenario.modes.length ? 5 : 1); index++) {
        const id = await createFixtureUser(
          admin,
          index === 0 ? email : fixtureEmail("matrix-member"),
        );
        users.push(id);
        scope.register("matrix user", () => deleteFixtureUser(admin, id));
        const { error } = await admin
          .from("profiles")
          .update({
            display_name: index === 0 ? "Aanya Mehta" : `Friend ${index}`,
            taste_line: "Thoughtful little things",
          })
          .eq("id", id);
        if (error) throw new Error("fixture profile failed");
        if (index < 4)
          await seedWishlistItems(admin, id, [
            {
              id: randomUUID(),
              title: `Member ${index} favourite`,
              retailer: "Fixture shop",
              original_amount_minor: "120000",
              original_currency: "INR",
              sort_position: 0,
            },
          ]);
      }
      const groupIds = scenario.modes.map(() => randomUUID());
      scope.register("matrix groups", async () => {
        if (groupIds.length) deleteFixtureGroupsSql(groupIds, users);
      });
      scenario.modes.forEach((mode, index) => {
        const groupId = groupIds[index];
        // Dedicated synthetic local fixtures; application reads still use caller RLS/RPCs.
        runStackSql(
          `insert into public.groups (id,name,occasion,occasion_at,time_zone,mode,organizer_id,budget_amount_minor,budget_currency,location) values ('${groupId}','Matrix occasion ${index + 1}','Diwali','2026-11-${String(7 + index).padStart(2, "0")} 18:00:00+05:30','Asia/Kolkata','${mode}','${users[0]}',250000,'INR','Mumbai'); ${users.map((id) => `insert into public.group_members (group_id,user_id,status,participating,joined_at,membership_generation) values ('${groupId}','${id}','joined',true,clock_timestamp(),1);`).join(" ")}`,
        );
        if (mode === "secret_draw") {
          const result = runStackSql(
            withIdentity(
              users[0],
              `select result from public.run_secret_draw('${groupId}',null);`,
            ),
          );
          expect(result).toContain("drawn");
        }
      });
      await mailpitLogin(page, email);
      if (!scenario.modes.length) {
        await expect(
          page.getByRole("heading", { name: "Welcome in, Aanya." }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "1 item on your wishlist" }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole("heading", { name: "Hey Aanya." }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "Matrix occasion 1", exact: true }),
        ).toBeVisible();
        await expect(page.getByText("5 in", { exact: true })).toBeVisible();
        if (groupIds.length > 1)
          await expect(
            page.getByRole("link", {
              name: `View all ${groupIds.length} groups`,
            }),
          ).toBeVisible();
      }
      await capture(page, "home-matrix");
      await page.goto("/groups");
      await capture(page, "groups-index-matrix");
      for (let index = 0; index < groupIds.length; index++) {
        const id = groupIds[index];
        await page.goto(`/groups/${id}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: `Matrix occasion ${index + 1}`,
          }),
        ).toBeVisible();
        await expect(
          page.getByText("Friend 4", { exact: true }).first(),
        ).toBeVisible();
        await expect(
          page.getByText("Member 1 favourite", { exact: true }).first(),
        ).toBeVisible();
        await capture(page, `room-${scenario.modes[index]}`);
        await page.goto(`/groups/${id}/gifting`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(
          page.getByText("This page could not be found."),
        ).toHaveCount(0);
        await capture(page, `gifting-${scenario.modes[index]}`);
        if (scenario.modes[index] === "gift_everyone") {
          const progress = page.getByRole("progressbar", {
            name: "Gifting checklist progress",
          });
          await expect(progress).toHaveAttribute("aria-valuenow", "0");
          await page
            .getByRole("button", {
              name: "Mark completed: Friend 1",
              exact: true,
            })
            .click();
          await expect(progress).toHaveAttribute("aria-valuenow", "1");
          await page.reload();
          await expect(progress).toHaveAttribute("aria-valuenow", "1");
          await page
            .getByRole("button", { name: "Reopen: Friend 1", exact: true })
            .click();
          await expect(progress).toHaveAttribute("aria-valuenow", "0");
        } else if (scenario.modes[index] === "wishlist_only") {
          await page
            .getByRole("link", { name: "Browse wishlists", exact: true })
            .click();
          await expect(page).toHaveURL(new RegExp(`/groups/${id}#wishlists$`));
          await expect(
            page.getByRole("region", { name: "Member wishlists", exact: true }),
          ).toBeInViewport();
        }
      }
    });
  });
