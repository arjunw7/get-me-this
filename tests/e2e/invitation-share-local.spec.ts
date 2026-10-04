import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  createFixtureUser,
  deleteFixtureUser,
  fixtureEmail,
  FixtureScope,
  stackAdminClient,
} from "../helpers/local-stack";
import {
  deleteFixtureGroupsSql,
  deleteInvitationContinuationRowsSql,
  runStackSql,
  withIdentity,
} from "../helpers/group-stack";

test.skip(!process.env.E2E_LOCAL_SUPABASE, "requires isolated local Supabase");
// Invitation capabilities must never enter failure traces.
test.use({ trace: "off" });

test("shared invitations show a dynamic banner while browser joining stays intact", async ({
  page,
  request,
}, testInfo) => {
  const admin = stackAdminClient();
  const ownerId = await createFixtureUser(admin, fixtureEmail("share-banner"));
  const groupId = randomUUID();
  const scope = new FixtureScope();
  scope.register("share banner fixture", async () => {
    deleteInvitationContinuationRowsSql([groupId], [ownerId]);
    deleteFixtureGroupsSql([groupId], [ownerId]);
    await deleteFixtureUser(admin, ownerId);
  });
  await scope.run(async () => {
    const { error } = await admin
      .from("profiles")
      .update({ display_name: "Arjun Wadhwa" })
      .eq("id", ownerId);
    if (error) throw new Error("Could not prepare local organizer");
    runStackSql(`insert into public.groups(id,name,occasion,occasion_at,time_zone,mode,organizer_id)
      values('${groupId}','Wadhwa Diwali Squad','Diwali','2026-11-06 18:00+05:30','Asia/Kolkata','wishlist_only','${ownerId}');
      insert into public.group_members(group_id,user_id,status,participating,membership_generation)
      values('${groupId}','${ownerId}','joined',true,1);`);
    const token = runStackSql(
      withIdentity(
        ownerId,
        `select token from public.get_group_invite_link('${groupId}');`,
      ),
    )
      .trim()
      .split("\n")
      .at(-1)!;
    const invitationPath = `/invite/${token}`;
    const response = await request.get(invitationPath, {
      headers: { "User-Agent": "WhatsApp/2.24" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["set-cookie"]).toBeUndefined();
    const html = await response.text();
    expect(html.includes(token)).toBe(false);
    expect(html).toContain("Hosted by Arjun Wadhwa · Fri, 6 Nov, 2026");
    expect(html).toContain("Wadhwa Diwali Squad");
    const imageUrl = /property="og:image" content="([^"]+)"/.exec(html)?.[1];
    expect(
      Boolean(imageUrl),
      "Share metadata needs an image URL; configure APP_ORIGIN for the test server",
    ).toBe(true);
    // Fail before fetching if inherited deployment configuration points away
    // from the local fixture server. Only the origin can appear in diagnostics.
    expect(new URL(imageUrl!).origin).toBe(
      new URL(testInfo.project.use.baseURL!).origin,
    );
    const imageResponse = await request.get(imageUrl!);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()["content-type"]).toContain("image/png");
    const evidence = process.env.E2E_INTERACTION_EVIDENCE_DIR;
    if (evidence) {
      await mkdir(evidence, { recursive: true });
      await writeFile(
        path.join(evidence, "invitation-banner.png"),
        await imageResponse.body(),
      );
      // A reviewer sees the exact PNG from the real route at both widths.
      await page.setContent(
        '<body style="margin:0"><img alt="Invitation banner" style="width:100%;display:block" /></body>',
      );
      await page.locator("img").evaluate(
        (element, source) => {
          (element as HTMLImageElement).src = source;
        },
        `data:image/png;base64,${(await imageResponse.body()).toString("base64")}`,
      );
      await page
        .locator("img")
        .evaluate((element) => (element as HTMLImageElement).decode());
      await page.screenshot({
        path: path.join(evidence, `banner-${testInfo.project.name}.png`),
      });
    }
    await page.goto(invitationPath);
    await expect(
      page.getByRole("heading", {
        name: "You're invited to Wadhwa Diwali Squad.",
      }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname.startsWith("/invite/continue/")).toBe(
      true,
    );
    if (evidence)
      await page.screenshot({
        path: path.join(
          evidence,
          `invite-browser-${testInfo.project.name}.png`,
        ),
        fullPage: true,
      });
    runStackSql(
      `update public.group_invitations set status='revoked' where group_id='${groupId}';`,
    );
    const revoked = await request.get(invitationPath, {
      headers: { "User-Agent": "WhatsApp/2.24" },
    });
    expect((await revoked.text()).includes("Wadhwa Diwali Squad")).toBe(false);
    expect((await request.get(imageUrl!)).status()).toBe(404);
  });
});
