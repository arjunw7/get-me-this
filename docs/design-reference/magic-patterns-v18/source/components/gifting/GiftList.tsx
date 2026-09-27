import React from 'react';
import type { Member, Product } from '../../types/wishlist';
import { formatINR, toINR } from '../../utils/money';
import { GiftItemCard } from './GiftItemCard';
interface GiftListProps {
  recipient: Member;
  items: Product[];
  budget: number;
  columns?: string;
}
function byAvailability(a: Product, b: Product) {
  return Number(!!a.reservedByOther) - Number(!!b.reservedByOther) || toINR(a.price, a.currency) - toINR(b.price, b.currency);
}
export function GiftList({
  recipient,
  items,
  budget,
  columns = 'sm:grid-cols-2 xl:grid-cols-3'
}: GiftListProps) {
  const within = items.filter(p => toINR(p.price, p.currency) <= budget).sort(byAvailability);
  const stretch = items.filter(p => toINR(p.price, p.currency) > budget).sort(byAvailability);
  if (items.length === 0) {
    return <p className="rounded-2xl border-2 border-dashed border-ink/25 p-6 text-ink-soft">
        {recipient.firstName}’s wishlist is empty. Bold of them. Try the group chat for hints.
      </p>;
  }
  return <div className="flex flex-col gap-10">
      {within.length > 0 && <section aria-labelledby={`within-${recipient.id}`}>
          <h3 id={`within-${recipient.id}`} className="font-display text-xl font-extrabold">
            Within your {formatINR(budget)}
          </h3>
          <ul className={`mt-4 grid gap-5 ${columns}`}>
            {within.map(p => <li key={p.id}>
                <GiftItemCard product={p} budget={budget} recipientName={recipient.firstName} />
              </li>)}
          </ul>
        </section>}
      {stretch.length > 0 && <section aria-labelledby={`stretch-${recipient.id}`}>
          <h3 id={`stretch-${recipient.id}`} className="font-display text-xl font-extrabold">
            A stretch, if you’re feeling generous
          </h3>
          <ul className={`mt-4 grid gap-5 ${columns}`}>
            {stretch.map(p => <li key={p.id}>
                <GiftItemCard product={p} budget={budget} recipientName={recipient.firstName} />
              </li>)}
          </ul>
        </section>}
    </div>;
}
