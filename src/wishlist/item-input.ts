import { currencyMinorDigits } from "./currency-metadata";

export type ItemFields = {
  title: string;
  sourceUrl: string;
  retailer: string;
  amount: string;
  currency: string;
  note: string;
  desireLevel: string;
};

export type CreateDraft = ItemFields & { submissionId: string };
export type EditPriceIntent = "preserve" | "clear" | "replace";
export type EditDraft = ItemFields & { priceIntent: string };
export type OriginalPair = {
  original_amount_minor: string | null;
  original_currency: string | null;
};

export type ValidItem = {
  title: string;
  source_url: string | null;
  retailer: string | null;
  note: string | null;
  desire_level: "really_want" | "would_love" | "just_an_idea";
  original_amount_minor: string | null;
  original_currency: string | null;
};

export type ValidatedEdit = {
  item: Omit<ValidItem, "original_amount_minor" | "original_currency">;
  price:
    | { kind: "preserve"; expected: OriginalPair & { original_amount_minor: string; original_currency: string } }
    | { kind: "clear" }
    | { kind: "replace"; original_amount_minor: string; original_currency: string };
};

export type Validation<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Partial<Record<keyof ItemFields | "submissionId" | "priceIntent", string>>; rawDraft: ItemFields & Record<string, string> };
export type CreateValidation = Validation<ValidItem & { submission_id: string }>;
export type EditValidation = Validation<ValidatedEdit>;

const MAX_BIGINT = BigInt("9223372036854775807");
const DESIRE_LEVELS = new Set(["really_want", "would_love", "just_an_idea"]);
const BLANK_CODE_POINTS = new Set([
  0x0009, 0x000a, 0x000b, 0x000c, 0x000d, 0x0020, 0x0085, 0x00a0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008,
  0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
]);

function isBlank(value: string): boolean {
  return [...value].every((char) => BLANK_CODE_POINTS.has(char.codePointAt(0)!));
}

function parseMinorAmount(amount: string, currency: string): string | null {
  const digits = currencyMinorDigits(currency);
  if (digits === null || !/^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.test(amount)) return null;
  const [, whole, fraction = ""] = amount.match(/^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/)!;
  if (fraction.length > digits) return null;
  const minor = BigInt(`${whole}${fraction.padEnd(digits, "0")}`);
  return minor <= MAX_BIGINT ? minor.toString() : null;
}

function renderMajor(minor: string, digits: number): string {
  const padded = minor.padStart(digits + 1, "0");
  return digits === 0 ? minor : `${padded.slice(0, -digits)}.${padded.slice(-digits)}`;
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19));
}

function isPrivateIpv6(host: string): boolean {
  const address = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!address.includes(":")) return false;
  if (address === "::" || address === "::1" || address.startsWith("fc") || address.startsWith("fd") ||
      /^fe[89ab]/.test(address) || address.startsWith("ff")) return true;
  if (address.startsWith("::ffff:")) {
    const tail = address.slice(7);
    if (tail.includes(".")) return isPrivateIpv4(tail);
    const words = tail.split(":");
    if (words.length === 2 && words.every((word) => /^[0-9a-f]{1,4}$/.test(word))) {
      const high = Number.parseInt(words[0], 16);
      const low = Number.parseInt(words[1], 16);
      return isPrivateIpv4(`${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`);
    }
  }
  return false;
}

function validPublicUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  let parsed: URL;
  try { parsed = new URL(value); } catch { return null; }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname ||
      parsed.username || parsed.password || parsed.hostname.toLowerCase() === "localhost" ||
      parsed.hostname.toLowerCase().endsWith(".localhost")) return null;
  const defaultPort = parsed.protocol === "http:" ? "80" : "443";
  if (parsed.port && parsed.port !== defaultPort) return null;
  const host = parsed.hostname.toLowerCase();
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) return null;
  return value;
}

function validateFields(draft: ItemFields, errors: Partial<Record<keyof ItemFields, string>>) {
  const title = draft.title.trim();
  const sourceUrlText = draft.sourceUrl.trim();
  const retailerText = draft.retailer.trim();
  const noteText = draft.note.trim();
  if (isBlank(title)) errors.title = "Enter a title.";
  else if ([...title].length > 200) errors.title = "Use 200 characters or fewer.";
  const sourceUrl = sourceUrlText ? validPublicUrl(sourceUrlText) : null;
  if (sourceUrlText && sourceUrl === null) errors.sourceUrl = "Enter a public HTTP or HTTPS link.";
  else if (sourceUrlText.length > 2048) errors.sourceUrl = "Use 2048 characters or fewer.";
  if (retailerText && ([...retailerText].length > 120 || isBlank(retailerText))) errors.retailer = "Use 1–120 characters.";
  if (noteText && [...noteText].length > 2000) errors.note = "Use 2000 characters or fewer.";
  if (!DESIRE_LEVELS.has(draft.desireLevel)) errors.desireLevel = "Choose a desire level.";
  return { title, source_url: sourceUrl, retailer: retailerText || null, note: noteText || null };
}

function failed<T>(draft: ItemFields & Record<string, string>, errors: Partial<Record<string, string>>): Validation<T> {
  return { ok: false, errors, rawDraft: { ...draft } } as Validation<T>;
}

export function validateCreateDraft(draft: CreateDraft): CreateValidation {
  const errors: Partial<Record<keyof ItemFields | "submissionId", string>> = {};
  const fields = validateFields(draft, errors);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.submissionId)) errors.submissionId = "Start a fresh item entry.";
  let originalAmount: string | null = null;
  let originalCurrency: string | null = null;
  if (draft.amount.trim()) {
    originalAmount = parseMinorAmount(draft.amount.trim(), draft.currency.trim().toUpperCase());
    if (originalAmount === null) errors.amount = "Enter a valid amount for a supported currency.";
    else originalCurrency = draft.currency.trim().toUpperCase();
  }
  if (Object.keys(errors).length) return failed(draft, errors);
  return { ok: true, value: { ...fields, desire_level: draft.desireLevel as ValidItem["desire_level"], original_amount_minor: originalAmount, original_currency: originalCurrency, submission_id: draft.submissionId } };
}

export function prefillOriginal(pair: OriginalPair):
  | { mode: "supported"; amount: string; currency: string }
  | { mode: "opaque"; rawMinor: string; currency: string }
  | { mode: "empty" } {
  if (pair.original_amount_minor === null && pair.original_currency === null) return { mode: "empty" };
  if (pair.original_amount_minor === null || pair.original_currency === null) throw new Error("original amount and currency must both be present or absent");
  const currency = pair.original_currency;
  const digits = currencyMinorDigits(currency);
  if (digits === null) return { mode: "opaque", rawMinor: pair.original_amount_minor, currency };
  return { mode: "supported", amount: renderMajor(pair.original_amount_minor, digits), currency };
}

export function validateEditDraft(draft: EditDraft, current: OriginalPair): EditValidation {
  const errors: Partial<Record<keyof ItemFields | "priceIntent", string>> = {};
  const fields = validateFields(draft, errors);
  let price: ValidatedEdit["price"] | null = null;
  if (draft.priceIntent === "preserve") {
    if (current.original_amount_minor === null || current.original_currency === null || currencyMinorDigits(current.original_currency) !== null) errors.priceIntent = "Invalid price action.";
    else price = { kind: "preserve", expected: { ...current, original_amount_minor: current.original_amount_minor, original_currency: current.original_currency } };
  } else if (draft.priceIntent === "clear") {
    if (draft.amount.trim()) errors.amount = "Clear the amount before removing the price.";
    else price = { kind: "clear" };
  } else if (draft.priceIntent === "replace") {
    if (!draft.amount.trim()) errors.amount = "Enter an amount or choose Clear price.";
    else {
      const amount = parseMinorAmount(draft.amount.trim(), draft.currency.trim().toUpperCase());
      if (amount === null) errors.amount = "Enter a valid amount for a supported currency.";
      else price = { kind: "replace", original_amount_minor: amount, original_currency: draft.currency.trim().toUpperCase() };
    }
  } else errors.priceIntent = "invalid";
  if (Object.keys(errors).length || price === null) return failed(draft, errors);
  return { ok: true, value: { item: { ...fields, desire_level: draft.desireLevel as ValidItem["desire_level"] }, price } };
}
