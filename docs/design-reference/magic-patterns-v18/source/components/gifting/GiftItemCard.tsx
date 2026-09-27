import React from 'react';
import { motion } from 'framer-motion';
import { CheckIcon, ExternalLinkIcon, EyeOffIcon, LockIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useCircle } from '../../contexts/CircleContext';
import type { Product } from '../../types/wishlist';
import { formatINR, toINR } from '../../utils/money';
import { DesireChip } from '../DesireChip';
import { PriceTag } from '../PriceTag';
interface GiftItemCardProps {
  product: Product;
  budget: number;
  recipientName: string;
}
export function GiftItemCard({
  product,
  budget,
  recipientName
}: GiftItemCardProps) {
  const {
    isReserved,
    toggleReservation
  } = useCircle();
  const mine = isReserved(product.id);
  const takenByOther = !!product.reservedByOther;
  const over = toINR(product.price, product.currency) - budget;
  function reserve() {
    toggleReservation(product.id);
    toast(mine ? 'Reservation released.' : `Reserved. ${recipientName} has no idea.`);
  }
  return <article className={`flex h-full flex-col overflow-hidden rounded-[24px] border-2 bg-white ${takenByOther ? 'border-ink/25' : mine ? 'border-ink shadow-chunk' : 'border-ink'}`}>
      <div className="relative aspect-[4/3] overflow-hidden bg-cream">
        {product.image ? <img src={product.image} alt={product.title} className={`h-full w-full object-cover ${takenByOther ? 'opacity-40 grayscale' : ''}`} loading="lazy" /> : null}
        <DesireChip desire={product.desire} className="absolute left-3 top-3" />
        {takenByOther && <span className="absolute inset-x-3 bottom-3 inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-ink bg-white py-1.5 text-sm font-bold">
            <EyeOffIcon className="h-4 w-4" aria-hidden="true" /> Reserved by someone else
          </span>}
        {mine && <motion.span initial={{
        opacity: 0,
        scale: 0.96
      }} animate={{
        opacity: 1,
        scale: 1
      }} transition={{
        duration: 0.18
      }} className="absolute right-3 top-3 inline-flex rotate-3 items-center gap-1 rounded-full border-2 border-ink bg-lime px-2.5 py-1 text-xs font-bold">
            <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> Reserved by you
          </motion.span>}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className={`font-display text-lg font-bold leading-tight ${takenByOther ? 'text-ink-soft' : ''}`}>{product.title}</h3>
        <p className="mt-1 text-sm text-ink-soft">
          <span className="font-semibold text-ink">{product.retailer}</span>
          <span aria-hidden="true"> · </span>
          <PriceTag price={product.price} currency={product.currency} />
        </p>
        <p className="mt-1 text-xs font-semibold text-ink-mute">
          {over > 0 ? `${formatINR(over)} over budget` : 'Within budget'}
        </p>
        {product.note && <p className="mt-3 rounded-2xl rounded-tl-sm bg-cream px-3 py-2 text-sm leading-snug">{product.note}</p>}

        <div className="mt-auto flex flex-col gap-2 pt-4">
          {takenByOther ? <p className="rounded-xl bg-cream px-3 py-2.5 text-center text-sm font-semibold text-ink-soft">
              Someone in the group has this covered.
            </p> : <>
              <button type="button" onClick={reserve} aria-pressed={mine} className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-ink text-sm font-bold transition-colors duration-150 ${mine ? 'bg-white hover:bg-cream' : 'bg-white hover:bg-electric-soft'}`}>
                {mine ? 'Release reservation' : <>
                    <LockIcon className="h-4 w-4" aria-hidden="true" /> Reserve secretly
                  </>}
              </button>
              <a href={product.url} target="_blank" rel="noopener noreferrer" aria-label={`Get this at ${product.retailer} (opens in a new tab)`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-ink bg-electric text-sm font-bold text-white transition-colors duration-150 hover:bg-electric-deep">
                Get this <ExternalLinkIcon className="h-4 w-4" aria-hidden="true" />
              </a>
            </>}
        </div>
      </div>
    </article>;
}
