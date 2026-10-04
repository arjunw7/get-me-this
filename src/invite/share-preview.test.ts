import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/src/supabase/config", () => ({
  getSupabasePublicConfig: () => ({
    url: "https://example.supabase.co",
    publishableKey: "public-fixture",
  }),
}));

import { loadInvitationSharePreview } from "./share-preview-data";
import {
  invitationShareResponse,
  isSharePreviewAgent,
} from "./share-preview-response";

const token = "A".repeat(43);
const digest = createHash("sha256").update(token).digest("hex");
const row = {
  group_name: 'Diwali <script> & "friends"',
  host_display_name: "Arjun",
  occasion_at: "2026-11-06T18:00:00",
};

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: [row], error: null });
  vi.stubEnv("APP_ORIGIN", "https://getmethis.fun");
});

describe("invitation share previews", () => {
  it("reads only the approved projection through a cookie-free public client", async () => {
    expect(await loadInvitationSharePreview(digest)).toEqual({
      groupName: row.group_name,
      organizerName: "Arjun",
      date: "Fri, 6 Nov, 2026",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("group_invitation_share_preview", {
      p_digest: digest,
    });
  });

  it("rejects malformed capabilities before querying", async () => {
    for (const value of [token, "bad", "a".repeat(63), "A".repeat(64)])
      expect(await loadInvitationSharePreview(value)).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed for denied, unavailable, ambiguous and malformed projections", async () => {
    for (const data of [
      [],
      [row, row],
      [{ ...row, occasion_at: "invalid" }],
      [{ ...row, group_name: null }],
    ]) {
      mocks.rpc.mockResolvedValueOnce({ data, error: null });
      expect(await loadInvitationSharePreview(digest)).toBeNull();
    }
    mocks.rpc.mockResolvedValueOnce({
      data: [row],
      error: { code: "PGRST202" },
    });
    expect(await loadInvitationSharePreview(digest)).toBeNull();
    mocks.rpc.mockRejectedValueOnce(new Error("transport failed"));
    expect(await loadInvitationSharePreview(digest)).toBeNull();
  });

  it("serves escaped, non-indexable HTML without the join bearer or cookies", async () => {
    const response = await invitationShareResponse(token);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('property="og:image"');
    expect(html).toContain(
      `https://getmethis.fun/invite/preview/${digest}/image`,
    );
    expect(html).toContain("Diwali &lt;script&gt; &amp; &quot;friends&quot;");
    expect(html).toContain("Hosted by Arjun · Fri, 6 Nov, 2026");
    expect(html).not.toContain(token);
    expect(html).not.toContain("<script>");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("returns the same generic metadata for invalid and unavailable invitations", async () => {
    const invalid = await invitationShareResponse("invalid");
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    const unavailable = await invitationShareResponse(token);
    expect(await unavailable.text()).toBe(await invalid.text());
  });

  it("recognizes common sharing agents without treating ordinary browsers as crawlers", () => {
    for (const agent of [
      "WhatsApp/2.24",
      "facebookexternalhit/1.1",
      "Facebot",
      "Twitterbot/1.0",
      "LinkedInBot/1.0",
      "Slackbot-LinkExpanding 1.0",
      "Discordbot/2.0",
      "TelegramBot (like TwitterBot)",
      "Applebot/0.1",
    ])
      expect(isSharePreviewAgent(agent), agent).toBe(true);
    expect(isSharePreviewAgent("Mozilla/5.0 Chrome/130.0")).toBe(false);
    expect(isSharePreviewAgent(null)).toBe(false);
  });
});
