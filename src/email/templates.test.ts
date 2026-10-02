import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  renderAssignmentEmail,
  renderInvitationEmail,
  renderReminderEmail,
} from "./templates";

/**
 * 009a template render tests: the exact seven-field invitation preview, the
 * generic Member fallback, hostile-input escaping, bounded rendering, and
 * the privacy invariants. Tokens are synthetic stand-ins (never real bearer
 * material).
 */

const SYNTHETIC_TOKEN = "F".repeat(43);
const BASE = "https://getmethis.test";

const hostile = '<script>alert("x")</script> & friends';

describe("invitation template", () => {
  const payload = {
    budget_amount_minor: "150000",
    budget_currency: "INR",
    gifting_mode: "secret_draw",
    group_id: "11111111-1111-4111-8111-111111111111",
    group_name: "Diwali Scenes",
    host_display_name: "Asha",
    invitation_id: "22222222-2222-4222-8222-222222222222",
    invitation_version: "3",
    joined_member_count: "5",
    occasion_date: "2026-11-08",
  };

  it("renders exactly the seven-field preview plus the raw-token CTA", () => {
    const rendered = renderInvitationEmail(payload, SYNTHETIC_TOKEN, BASE);
    expect(rendered.text).toContain("Diwali Scenes");
    expect(rendered.text).toContain("Asha");
    expect(rendered.text).toContain("Occasion date: 2026-11-08");
    expect(rendered.text).toContain("150000 minor units (INR)");
    expect(rendered.text).toContain("Gifting mode: secret_draw");
    expect(rendered.text).toContain("Joined members so far: 5");
    expect(rendered.text).toContain(`${BASE}/invite/${SYNTHETIC_TOKEN}`);
    expect(rendered.html).toContain("no-referrer");
  });

  it("exposes the token only in the rendered body's link, never in the subject", () => {
    const rendered = renderInvitationEmail(payload, SYNTHETIC_TOKEN, BASE);
    expect(rendered.subject).not.toContain(SYNTHETIC_TOKEN);
    expect(rendered.html).toContain(`/invite/${SYNTHETIC_TOKEN}`);
  });

  it("renders no membership outcome claim", () => {
    const rendered = renderInvitationEmail(payload, SYNTHETIC_TOKEN, BASE);
    expect(rendered.text.toLowerCase()).not.toContain("you have joined");
    expect(rendered.text.toLowerCase()).not.toContain("membership");
  });

  it("escapes hostile group and host names in both alternatives", () => {
    const rendered = renderInvitationEmail(
      { ...payload, group_name: hostile, host_display_name: hostile },
      SYNTHETIC_TOKEN,
      BASE,
    );
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.text).toContain('<script>alert("x")</script>');
  });
});

describe("assignment template", () => {
  const payload = {
    draw_version: "2",
    group_id: "11111111-1111-4111-8111-111111111111",
    group_name: "Secret Santa Crew",
    occasion_date: "2026-12-20",
    recipient_display_name: "Dev",
  };

  it("renders exactly what my_assignment shows the giver", () => {
    const rendered = renderAssignmentEmail(payload, BASE, null);
    expect(rendered.text).toContain("you're giving to Dev");
    expect(rendered.text).toContain("Occasion date: 2026-12-20");
    expect(rendered.text).toContain(`${BASE}/groups/${payload.group_id}`);
  });

  it("renders the generic Member fallback for the null-recipient is_valid=false state", () => {
    const rendered = renderAssignmentEmail(
      { ...payload, recipient_display_name: null },
      BASE,
      "/gifting/assignment",
    );
    expect(rendered.text).toContain("giving to Member");
    expect(rendered.text).toContain(`${BASE}/gifting/assignment`);
  });

  it("never embeds assignment data in the URL", () => {
    const rendered = renderAssignmentEmail(payload, BASE, null);
    expect(rendered.html).not.toContain("recipient");
    expect(rendered.html).not.toContain("draw_version");
  });

  it("escapes hostile recipient and group names", () => {
    const rendered = renderAssignmentEmail(
      { ...payload, group_name: hostile, recipient_display_name: hostile },
      BASE,
      null,
    );
    expect(rendered.html).not.toContain("<script>");
  });
});

describe("reminder template", () => {
  const payload = {
    group_id: "11111111-1111-4111-8111-111111111111",
    group_name: "Housewarming Hoopla",
    occasion_date: "2026-12-01",
    reminder_offset_days: "7",
  };

  it("renders group name, occasion date, and the group-room link only", () => {
    const rendered = renderReminderEmail(payload, BASE);
    expect(rendered.text).toContain("Housewarming Hoopla");
    expect(rendered.text).toContain("Occasion date: 2026-12-01");
    expect(rendered.text).toContain(`${BASE}/groups/${payload.group_id}`);
  });

  it("carries no per-member gifting, reservation, checklist, or assignment content", () => {
    const rendered = renderReminderEmail(payload, BASE);
    const haystack =
      `${rendered.subject}\n${rendered.html}\n${rendered.text}`.toLowerCase();
    for (const banned of [
      "assignment",
      "reservation",
      "checklist",
      "giving to",
      "drawn",
      "secret draw",
    ]) {
      expect(haystack).not.toContain(banned);
    }
  });
});
