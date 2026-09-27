import type { Member } from '../types/wishlist';

export const ME_ID = 'aanya';

export const members: Member[] = [
  {
    id: 'aanya',
    name: 'Aanya Mehta',
    firstName: 'Aanya',
    initials: 'AM',
    color: 'coral',
    status: 'joined',
    tagline: 'currently in my tiny-luxuries era',
    isMe: true,
    isOrganizer: true,
  },
  {
    id: 'kabir',
    name: 'Kabir Khanna',
    firstName: 'Kabir',
    initials: 'KK',
    color: 'electric',
    status: 'joined',
    tagline: 'chronically online, physically at a café',
    tastes: ['coffee snob', 'vinyl over streaming', 'hats, many hats', 'desk toys'],
    sizes: 'Tops M · Hats 58cm',
  },
  {
    id: 'zoya',
    name: 'Zoya Sheikh',
    firstName: 'Zoya',
    initials: 'ZS',
    color: 'marigold',
    status: 'joined',
    tagline: 'film photos and very specific hair accessories',
    tastes: ['analogue everything', 'hair claws', 'soft colours'],
    sizes: 'Tops S',
  },
  {
    id: 'rohan',
    name: 'Rohan Iyer',
    firstName: 'Rohan',
    initials: 'RI',
    color: 'lime',
    status: 'joined',
    tagline: 'pickleball convert, espresso evangelist',
    tastes: ['racket sports', 'tiny cups', 'kitchen gear'],
    sizes: 'Shoes UK 9',
  },
  {
    id: 'sam',
    name: 'Sam Okafor',
    firstName: 'Sam',
    initials: 'SO',
    color: 'ink',
    status: 'joined',
    tagline: 'London-based, Bombay-hearted, always journaling',
    tastes: ['stationery', 'good totes', 'anything handmade'],
    sizes: 'Tops L',
  },
  {
    id: 'meera',
    name: 'Meera Pillai',
    firstName: 'Meera',
    initials: 'MP',
    color: 'marigold',
    status: 'pending',
    tagline: '',
  },
  {
    id: 'dev',
    name: 'Dev Arora',
    firstName: 'Dev',
    initials: 'DA',
    color: 'lime',
    status: 'pending',
    tagline: '',
  },
];

export function getMember(id: string): Member {
  const member = members.find((m) => m.id === id);
  if (!member) throw new Error(`Unknown member ${id}`);
  return member;
}
