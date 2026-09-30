import { prefillOriginal, type CreateDraft, type EditDraft } from "./item-input";

export function createDraftDefaults(submissionId: string): CreateDraft {
  return { title: "", sourceUrl: "", retailer: "", amount: "", currency: "INR", note: "", desireLevel: "would_love", submissionId };
}

export function editDraftDefaults(item: {
  title: string; source_url: string | null; retailer: string | null; note: string | null;
  desire_level: string; original_amount_minor: string | null; original_currency: string | null;
}): EditDraft {
  const price = prefillOriginal({ original_amount_minor: item.original_amount_minor, original_currency: item.original_currency });
  return {
    title: item.title,
    sourceUrl: item.source_url ?? "",
    retailer: item.retailer ?? "",
    amount: price.mode === "supported" ? price.amount : "",
    currency: price.mode === "supported" ? price.currency : "INR",
    note: item.note ?? "",
    desireLevel: item.desire_level,
    priceIntent: price.mode === "opaque" ? "preserve" : price.mode === "empty" ? "clear" : "replace",
  };
}
