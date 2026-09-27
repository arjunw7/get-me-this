import React from 'react';
import type { Product } from '../types/wishlist';
import { DesireChip } from './DesireChip';
import { PriceTag } from './PriceTag';
import { Tape } from './Tape';
interface ShelfieCardProps {
  product: Product;
  aspect?: string;
  tilt?: string;
  tape?: boolean;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  compact?: boolean;
}
export function ShelfieCard({
  product,
  aspect = 'aspect-[4/5]',
  tilt = '',
  tape = false,
  badge,
  children,
  compact = false
}: ShelfieCardProps) {
  return <div className={`relative ${tilt}`}>
      {tape && <Tape className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 -rotate-3" />}
      <article className="flex h-full flex-col overflow-hidden rounded-[26px] border-2 border-ink bg-white shadow-chunk">
        <div className={`relative ${aspect} overflow-hidden bg-cream`}>
          {product.image ? <img src={product.image} alt={product.title} className="h-full w-full object-cover" loading="lazy" /> : <span className="flex h-full w-full items-center justify-center p-6 text-center font-display text-2xl font-extrabold text-ink/25">
              {product.title}
            </span>}
          <DesireChip desire={product.desire} className="absolute left-3 top-3" />
          {badge && <div className="absolute bottom-3 left-3 right-3">{badge}</div>}
        </div>
        <div className={`flex flex-1 flex-col gap-2 ${compact ? 'p-3.5' : 'p-4'}`}>
          <div>
            <h3 className={`font-display font-bold leading-tight ${compact ? 'text-base' : 'text-lg'}`}>{product.title}</h3>
            <p className="mt-1 text-sm text-ink-soft">
              <span className="font-semibold text-ink">{product.retailer}</span>
              <span aria-hidden="true"> · </span>
              <PriceTag price={product.price} currency={product.currency} />
            </p>
          </div>
          {product.note && <p className="relative rounded-2xl rounded-tl-sm bg-cream px-3 py-2 text-sm leading-snug text-ink">
              {product.note}
            </p>}
          {children && <div className="mt-auto pt-1">{children}</div>}
        </div>
      </article>
    </div>;
}
