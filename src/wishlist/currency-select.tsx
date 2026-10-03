"use client";
import { SearchableSelect } from "@/src/ui/searchable-select";
import { SUPPORTED_CURRENCY_CODES } from "./currency-metadata";

const names = new Intl.DisplayNames("en", { type: "currency" });
const allCodes = Array.from(
  new Set(["INR", "USD", "GBP", "EUR", ...SUPPORTED_CURRENCY_CODES]),
);
export function CurrencySelect({
  id,
  name,
  value,
  onChange,
  codes = allCodes,
  disabled,
  className,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  codes?: readonly string[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <SearchableSelect
      id={id}
      label="Currency"
      name={name}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={className}
      placeholder="Search currencies"
      options={codes.map((code) => ({
        value: code,
        label: code,
        description: names.of(code) ?? code,
      }))}
    />
  );
}
