import { decimalToMinorUnits } from "./money";
export function confirmsMoney(
  markdown: unknown,
  money: { amountMinor: string; currency: string },
): boolean {
  if (typeof markdown !== "string") return false;
  const evidence: {
    amountMinor: string;
    currency: string;
    current: boolean;
  }[] = [];
  const add = (amount: string, currency: string, match: RegExpMatchArray) => {
    const parsed = decimalToMinorUnits(amount.replaceAll(",", ""), currency);
    if (!parsed) return;
    const index = match.index ?? 0;
    // Bounded local context, including a label on the preceding line. Do not
    // scan the full document for every amount or treat MRP as a current offer.
    const before = markdown
      .slice(Math.max(0, index - 160), index)
      .replace(/[*_`]/gu, "")
      .replace(
        /(?:(?:\b(?:AUD|CAD|CHF|EUR|GBP|INR|JPY|NZD|SGD|USD)|[₹€£$])\s*){1,2}$/u,
        "",
      );
    const after = markdown
      .slice(index + match[0].length, index + match[0].length + 160)
      .split("\n", 1)[0]!
      .replace(/[*_`]/gu, "")
      .replace(
        /^\s*(?:(?:\b(?:AUD|CAD|CHF|EUR|GBP|INR|JPY|NZD|SGD|USD)|[₹€£$])\s*){1,2}/u,
        "",
      );
    const listBefore =
      /\b(?:M\.?R\.?P\.?|MSRP|RRP|(?:list|original|regular)(?:\s+price)?|was)\s*[.:]?\s*$/iu.test(
        before,
      );
    const listAfter =
      /^\s*(?:\(\s*)?(?:M\.?R\.?P\.?|MSRP|RRP|(?:list|original|regular)\s+price)\b/iu.test(
        after,
      );
    const struck = /~~\s*$/u.test(before) && /^\s*~~/u.test(after);
    evidence.push({ ...parsed, current: !listBefore && !listAfter && !struck });
  };
  for (const match of markdown.matchAll(
    /\b(AUD|CAD|CHF|EUR|GBP|INR|JPY|NZD|SGD|USD)\s*[:$₹€£]?\s*(\d[\d,]*(?:\.\d+)?)/gu,
  ))
    add(match[2]!, match[1]!, match);
  for (const match of markdown.matchAll(
    /(\d[\d,]*(?:\.\d+)?)\s*(AUD|CAD|CHF|EUR|GBP|INR|JPY|NZD|SGD|USD)\b/gu,
  ))
    add(match[1]!, match[2]!, match);
  const symbols: Record<string, string> = {
    "₹": "INR",
    "€": "EUR",
    "£": "GBP",
  };
  for (const match of markdown.matchAll(/([₹€£])\s*(\d[\d,]*(?:\.\d+)?)/gu))
    add(match[2]!, symbols[match[1]!]!, match);
  // Symbols validate a proposal; they never supply a missing currency.
  // A bare dollar/yen sign cannot disambiguate ISO currencies.
  return (
    evidence.some(
      (item) =>
        item.current &&
        item.amountMinor === money.amountMinor &&
        item.currency === money.currency,
    ) &&
    !evidence.some(
      (item) =>
        item.amountMinor === money.amountMinor &&
        item.currency !== money.currency,
    )
  );
}
