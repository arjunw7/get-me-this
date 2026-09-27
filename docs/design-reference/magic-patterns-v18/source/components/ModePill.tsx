import React from 'react';
import { EyeIcon, ListChecksIcon, ShuffleIcon } from 'lucide-react';
import { giftingModes } from '../data/circle';
import type { GiftingMode } from '../types/wishlist';
const icons = {
  secret: ShuffleIcon,
  everyone: ListChecksIcon,
  browse: EyeIcon
};
interface ModePillProps {
  mode: GiftingMode;
  className?: string;
}
export function ModePill({
  mode,
  className = ''
}: ModePillProps) {
  const Icon = icons[mode];
  const info = giftingModes.find(m => m.id === mode);
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-xs font-bold text-paper ${className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {info?.name}
    </span>;
}
