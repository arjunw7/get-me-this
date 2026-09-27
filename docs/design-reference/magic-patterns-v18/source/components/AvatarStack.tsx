import React from 'react';
import type { Member } from '../types/wishlist';
import { Avatar } from './Avatar';
interface AvatarStackProps {
  members: Member[];
  max?: number;
  size?: 'xs' | 'sm' | 'md';
}
export function AvatarStack({
  members,
  max = 5,
  size = 'sm'
}: AvatarStackProps) {
  const visible = members.slice(0, max);
  const extra = members.length - visible.length;
  return <div className="flex items-center">
      {visible.map((m, i) => <Avatar key={m.id} member={m} size={size} className={`${i > 0 ? '-ml-2.5' : ''} ring-2 ring-white`} />)}
      {extra > 0 && <span className="-ml-2.5 inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink bg-cream text-xs font-bold ring-2 ring-white">
          +{extra}
        </span>}
    </div>;
}
