import type { AccentColor, Member } from '../types/wishlist';

export const accentFill: Record<AccentColor | 'ink', string> = {
  coral: 'bg-coral text-ink',
  marigold: 'bg-marigold text-ink',
  electric: 'bg-electric text-white',
  lime: 'bg-lime text-ink',
  ink: 'bg-ink text-paper',
};

export const accentSoft: Record<AccentColor, string> = {
  coral: 'bg-coral-soft',
  marigold: 'bg-marigold-soft',
  electric: 'bg-electric-soft',
  lime: 'bg-lime-soft',
};

export const accentLabels: Record<AccentColor, string> = {
  coral: 'Tomato',
  marigold: 'Marigold',
  electric: 'Electric',
  lime: 'Acid lime',
};

export function possessive(member: Member): string {
  return member.isMe ? 'Your' : `${member.firstName}'s`;
}
