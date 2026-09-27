import type { Currency } from '../types/wishlist';

export const RATES_TO_INR: Record<Currency, number> = {
  INR: 1,
  USD: 84,
  GBP: 111,
  EUR: 91,
};

const LOCALES: Record<Currency, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  GBP: 'en-GB',
  EUR: 'en-IE',
};

export function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(LOCALES[currency], {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function toINR(amount: number, currency: Currency): number {
  if (currency === 'INR') return amount;
  return Math.round((amount * RATES_TO_INR[currency]) / 10) * 10;
}

export function formatINR(amount: number): string {
  return formatMoney(amount, 'INR');
}
