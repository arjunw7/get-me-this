import React from 'react';
import type { Currency } from '../types/wishlist';
import { formatINR, formatMoney, toINR } from '../utils/money';
interface PriceTagProps {
  price: number;
  currency: Currency;
  className?: string;
}
export function PriceTag({
  price,
  currency,
  className = ''
}: PriceTagProps) {
  if (currency === 'INR') {
    return <span className={`font-bold tabular-nums ${className}`}>{formatINR(price)}</span>;
  }
  return <span className={`tabular-nums ${className}`}>
      <span className="font-bold">{formatMoney(price, currency)}</span>
      <span className="font-medium text-ink-mute"> · ≈ {formatINR(toINR(price, currency))}</span>
    </span>;
}
