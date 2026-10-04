import type { MemberWishlistItem } from "./member-wishlist-data";
import { MemberWishlistItemCard } from "./member-wishlist-screen";
import type { ReservationViewerState } from "./reservations/types";
import { GiftingReserveControl } from "./gifting-reserve-control";
import { budgetFit, giftingBudgetLabel, giftingMoney } from "./gifting-budget";

export function GiftingProductGrid({
  groupId,
  items,
  states,
  budgetAmount,
  budgetCurrency,
  columns = 3,
}: {
  groupId: string;
  items: readonly MemberWishlistItem[];
  states: Record<string, ReservationViewerState>;
  budgetAmount: string | null;
  budgetCurrency: string | null;
  columns?: 2 | 3;
}) {
  const budget = giftingMoney(budgetAmount, budgetCurrency);
  const sections = [
    {
      key: "within",
      title: budget ? `Within your ${budget}` : "Gift ideas",
      items: items.filter(
        (item) => budgetFit(item, budgetAmount, budgetCurrency) === "within",
      ),
    },
    {
      key: "over",
      title: "A stretch, if you’re feeling generous",
      items: items.filter(
        (item) => budgetFit(item, budgetAmount, budgetCurrency) === "over",
      ),
    },
    {
      key: "unknown",
      title: budget ? "More gift ideas" : "Gift ideas",
      items: items.filter(
        (item) => budgetFit(item, budgetAmount, budgetCurrency) === "unknown",
      ),
    },
  ];
  if (!items.length)
    return (
      <p className="rounded-surface-lg border-2 border-dashed border-outline/30 px-5 py-8 text-center text-content-secondary">
        No wishlist ideas yet. Check back once they&apos;ve added a few.
      </p>
    );
  return (
    <div className="space-y-10">
      {sections
        .filter((section) => section.items.length)
        .map((section) => (
          <section key={section.key}>
            <h2 className="mb-4 font-display text-heading tracking-tight">
              {section.title}
            </h2>
            <ul
              className={`grid gap-5 sm:grid-cols-2 ${columns === 3 ? "xl:grid-cols-3" : ""}`}
            >
              {section.items.map((item) => (
                <li key={item.itemId} className="min-w-0">
                  <MemberWishlistItemCard
                    item={item}
                    groupId={groupId}
                    presentation="gifting"
                    reservedByOther={states[item.itemId] === "other"}
                    budgetLabel={giftingBudgetLabel(
                      item,
                      budgetAmount,
                      budgetCurrency,
                    )}
                  >
                    {states[item.itemId] ? (
                      <GiftingReserveControl
                        groupId={groupId}
                        itemId={item.itemId}
                        viewerState={states[item.itemId]}
                      />
                    ) : null}
                  </MemberWishlistItemCard>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
