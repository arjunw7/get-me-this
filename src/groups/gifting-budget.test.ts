import { describe, it, expect } from "vitest";
import { budgetFit, giftingBudgetLabel, giftingMoney } from "./gifting-budget";
import type { MemberWishlistItem } from "./member-wishlist-data";
const item: MemberWishlistItem = {
  itemId: "item",
  title: "Item",
  sourceUrl: null,
  retailer: null,
  imageUrl: null,
  note: null,
  desireLevel: "would_love",
  originalAmountMinor: "250000",
  originalCurrency: "INR",
};
describe("truthful gifting budget", () => {
  it("compares exact same-currency prices without losing bigint precision", () => {
    expect(budgetFit(item, "250000", "INR")).toBe("within");
    expect(
      budgetFit(
        { ...item, originalAmountMinor: "9007199254740993" },
        "9007199254740992",
        "INR",
      ),
    ).toBe("over");
    expect(
      giftingBudgetLabel(
        { ...item, originalAmountMinor: "399900" },
        "250000",
        "INR",
      ),
    ).toBe("₹1,499 over budget");
  });
  it("never presents missing or foreign prices as fitting the budget", () => {
    expect(
      budgetFit({ ...item, originalCurrency: "USD" }, "250000", "INR"),
    ).toBe("unknown");
    expect(
      budgetFit({ ...item, originalAmountMinor: null }, "250000", "INR"),
    ).toBe("unknown");
    expect(budgetFit(item, null, null)).toBe("unknown");
  });
  it("formats supported currency symbols without discarding nonzero precision", () => {
    expect(giftingMoney("250000", "INR")).toBe("₹2,500");
    expect(giftingMoney("250010", "INR")).toBe("₹2,500.10");
    expect(giftingMoney(null, null)).toBeNull();
  });
});
