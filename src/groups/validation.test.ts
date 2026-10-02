import { describe, expect, it } from "vitest";

import { normalizeGroupName, validateGroupForm } from "./validation";

/**
 * Canonicalization and validation (brief 006b): Unicode NFC, whitespace
 * collapse, the 80-code-point bound, every occasion and mode mapping, real
 * calendar dates, and the explicit-null optional fields.
 */

const base = {
  occasionType: "birthday",
  occasionDate: "2026-12-18",
  timeZone: "Asia/Kolkata",
  budgetAmount: "2500",
  budgetCurrency: "INR",
  mode: "secret_draw",
};

function fields(overrides: Partial<Record<string, string>>) {
  return { name: "Rohan turns 27", ...base, ...overrides };
}

describe("normalizeGroupName", () => {
  it("applies NFC, trims outer whitespace, and collapses runs", () => {
    expect(normalizeGroupName("  Rohan   turns 27 ")).toBe("Rohan turns 27");
    expect(normalizeGroupName("Cafe\u0301 corner")).toBe("Café corner");
    expect(normalizeGroupName("a\u00A0\t\nb")).toBe("a b");
  });

  it("collapses every Unicode whitespace class the database checks", () => {
    expect(normalizeGroupName("x\u2028\u2029\u3000y")).toBe("x y");
  });
});

describe("validateGroupForm", () => {
  it("builds canonical payload v1 with explicit nulls", () => {
    const result = validateGroupForm(fields({}));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload).toEqual({
        contract_version: 1,
        name: "Rohan turns 27",
        occasion_type: "birthday",
        occasion_date: "2026-12-18",
        time_zone: "Asia/Kolkata",
        location: null,
        description: null,
        budget_amount_minor: "250000",
        budget_currency: "INR",
        mode: "secret_draw",
        organizer_participating: true,
      });
    }
  });

  it("maps every approved occasion value", () => {
    for (const [value, label] of [
      ["diwali", "Diwali"],
      ["eid", "Eid"],
      ["birthday", "Birthday"],
      ["wedding", "Wedding"],
      ["housewarming", "Housewarming"],
      ["secret_santa", "Secret Santa"],
      ["other", "Something else"],
    ] as const) {
      const result = validateGroupForm(fields({ occasionType: value }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload.occasion_type).toBe(value);
      void label;
    }
  });

  it("maps every approved gifting mode", () => {
    for (const value of ["secret_draw", "gift_everyone", "wishlist_only"]) {
      const result = validateGroupForm(fields({ mode: value }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.payload.mode).toBe(value);
    }
  });

  it("bounds the name at exactly 80 Unicode code points", () => {
    const eighty = "あ".repeat(80);
    const eightyOne = `${eighty}あ`;
    expect(validateGroupForm(fields({ name: eighty })).ok).toBe(true);
    expect(validateGroupForm(fields({ name: eightyOne })).ok).toBe(false);
    // An emoji family counts as code points, not UTF-16 units.
    const emoji = "🎉".repeat(40);
    expect(validateGroupForm(fields({ name: emoji })).ok).toBe(true);
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(validateGroupForm(fields({ name: "   " })).ok).toBe(false);
  });

  it("rejects non-existent calendar dates", () => {
    expect(validateGroupForm(fields({ occasionDate: "2026-02-30" })).ok).toBe(
      false,
    );
    expect(validateGroupForm(fields({ occasionDate: "2026-13-01" })).ok).toBe(
      false,
    );
    expect(validateGroupForm(fields({ occasionDate: "18-12-2026" })).ok).toBe(
      false,
    );
  });

  it("does not reject a past date in this slice", () => {
    expect(validateGroupForm(fields({ occasionDate: "2020-01-01" })).ok).toBe(
      true,
    );
  });

  it("rejects occasions, modes, and currencies outside the closed sets", () => {
    expect(validateGroupForm(fields({ occasionType: "anniversary" })).ok).toBe(
      false,
    );
    expect(validateGroupForm(fields({ mode: "auction" })).ok).toBe(false);
    expect(validateGroupForm(fields({ budgetCurrency: "JPY" })).ok).toBe(false);
    expect(validateGroupForm(fields({ budgetCurrency: "inr" })).ok).toBe(false);
  });

  it("carries exact minor units from the money parser", () => {
    const result = validateGroupForm(fields({ budgetAmount: "24.99" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.budget_amount_minor).toBe("2499");
  });

  it("reports field errors without discarding valid fields", () => {
    const result = validateGroupForm(
      fields({ name: "", budgetAmount: "nope" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["budget", "name"]);
    }
  });
});
