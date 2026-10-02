import type { CanonicalPayloadV1 } from "./canonical";
import {
  CURRENCY_EXPONENTS,
  GIFTING_MODES,
  OCCASIONS,
  SELECTABLE_CURRENCIES,
  type GiftingMode,
  type OccasionType,
  type SelectableCurrency,
} from "./occasions";
import { parseBudgetToMinor } from "./money";

/**
 * Form-level validation for group creation (brief 006b). The Server Action
 * and the database repeat every rule; these shared bounds never diverge from
 * the database's (name 1-80 code points, exact money range, real calendar
 * date, resolvable IANA zone).
 */

export interface GroupFormFields {
  readonly name: string;
  readonly occasionType: string;
  readonly occasionDate: string;
  readonly timeZone: string;
  readonly budgetAmount: string;
  readonly budgetCurrency: string;
  readonly mode: string;
}

export type GroupFieldKey = "name" | "occasion" | "date" | "budget" | "mode";

export type GroupFieldErrors = Partial<Record<GroupFieldKey | "form", string>>;

export type GroupFormValidation =
  | { ok: true; payload: CanonicalPayloadV1 }
  | { ok: false; errors: GroupFieldErrors };

const NAME_MAX_CODE_POINTS = 80;
const TIME_ZONE_MAX_LENGTH = 64;

/**
 * Whitespace runs (Unicode) collapse to one space; outer whitespace is
 * removed; the result is NFC-normalized and must be 1-80 code points. This
 * mirrors the database normalization exactly.
 */
export function normalizeGroupName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(
      /[\u0009\u000A\u000B\u000C\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+/gu,
      " ",
    )
    .trim();
}

function isRealCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/**
 * The browser-resolved IANA time zone. Missing or invalid time-zone data is a
 * form error — the implementation never silently substitutes the server zone
 * or UTC.
 */
export function resolveBrowserTimeZone(): string | null {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (
      typeof resolved === "string" &&
      resolved.length > 0 &&
      resolved.length <= TIME_ZONE_MAX_LENGTH
    ) {
      return resolved;
    }
    return null;
  } catch {
    return null;
  }
}

function asOccasionType(value: string): OccasionType | null {
  return (OCCASIONS as ReadonlyArray<{ value: string }>).some(
    (occasion) => occasion.value === value,
  )
    ? (value as OccasionType)
    : null;
}

function asGiftingMode(value: string): GiftingMode | null {
  return (GIFTING_MODES as ReadonlyArray<{ value: string }>).some(
    (mode) => mode.value === value,
  )
    ? (value as GiftingMode)
    : null;
}

function asCurrency(value: string): SelectableCurrency | null {
  return (SELECTABLE_CURRENCIES as ReadonlyArray<string>).includes(value)
    ? (value as SelectableCurrency)
    : null;
}

export function validateGroupForm(
  fields: GroupFormFields,
): GroupFormValidation {
  const errors: GroupFieldErrors = {};

  const name = normalizeGroupName(fields.name);
  if (name.length === 0) {
    errors.name = "Give it a name so people recognise the invite.";
  } else if ([...name].length > NAME_MAX_CODE_POINTS) {
    errors.name = `Keep the name within ${NAME_MAX_CODE_POINTS} characters.`;
  }

  const occasionType = asOccasionType(fields.occasionType);
  if (!occasionType) errors.occasion = "Pick the occasion.";

  if (!isRealCalendarDate(fields.occasionDate)) {
    errors.date = "Pick the real calendar date.";
  }

  const currency = asCurrency(fields.budgetCurrency);
  const budgetParse = currency
    ? parseBudgetToMinor(fields.budgetAmount, currency)
    : ({ ok: false, reason: "format" } as const);
  if (!currency) {
    errors.budget = "Pick a supported currency.";
  } else if (budgetParse.ok === false) {
    errors.budget =
      budgetParse.reason === "empty"
        ? "Set a budget per person."
        : budgetParse.reason === "fraction"
          ? `Use at most ${CURRENCY_EXPONENTS[currency]} decimal places for ${currency}.`
          : budgetParse.reason === "range"
            ? "That budget is too large."
            : "Enter the budget as a plain amount, like 2500 or 24.99.";
  }

  const mode = asGiftingMode(fields.mode);
  if (!mode) errors.mode = "Choose how people gift.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    payload: {
      contract_version: 1,
      name,
      occasion_type: occasionType!,
      occasion_date: fields.occasionDate,
      time_zone: fields.timeZone,
      location: null,
      description: null,
      budget_amount_minor: budgetParse.ok
        ? budgetParse.minorUnits.toString()
        : "",
      budget_currency: currency!,
      mode: mode!,
      organizer_participating: true,
    },
  };
}
