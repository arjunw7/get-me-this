import React from 'react';
import type { Desire } from '../types/wishlist';
export const desireOptions: {
  id: Desire;
  label: string;
  hint: string;
}[] = [{
  id: 'really',
  label: 'really want',
  hint: 'Top of the list'
}, {
  id: 'love',
  label: 'would love',
  hint: 'Solid yes'
}, {
  id: 'idea',
  label: 'just an idea',
  hint: 'No pressure'
}];
const styles: Record<Desire, string> = {
  really: 'bg-coral text-ink border-ink',
  love: 'bg-marigold-soft text-ink border-ink',
  idea: 'bg-white text-ink-soft border-dashed border-ink/40'
};
const dots: Record<Desire, string> = {
  really: 'bg-ink',
  love: 'bg-marigold-deep',
  idea: 'bg-ink/30'
};
interface DesireChipProps {
  desire: Desire;
  className?: string;
}
export function DesireChip({
  desire,
  className = ''
}: DesireChipProps) {
  const label = desireOptions.find(d => d.id === desire)?.label ?? '';
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-2.5 py-1 text-xs font-bold ${styles[desire]} ${className}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dots[desire]}`} />
      {label}
    </span>;
}
