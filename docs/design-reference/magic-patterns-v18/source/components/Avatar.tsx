import React from 'react';
import type { AccentColor, Member } from '../types/wishlist';
import { accentFill } from '../utils/accent';
type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
interface AvatarProps {
  member: Pick<Member, 'name' | 'initials' | 'color' | 'status'>;
  size?: AvatarSize;
  colorOverride?: AccentColor;
  className?: string;
}
const sizes: Record<AvatarSize, string> = {
  xs: 'h-7 w-7 text-[11px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-24 w-24 text-3xl'
};
export function Avatar({
  member,
  size = 'md',
  colorOverride,
  className = ''
}: AvatarProps) {
  const pending = member.status === 'pending';
  const fill = pending ? 'bg-paper text-ink-mute border-2 border-dashed border-ink/40' : `${accentFill[colorOverride ?? member.color]} border-2 border-ink`;
  return <span role="img" aria-label={pending ? `${member.name} (invited)` : member.name} className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-bold ${sizes[size]} ${fill} ${className}`}>
      {member.initials}
    </span>;
}
