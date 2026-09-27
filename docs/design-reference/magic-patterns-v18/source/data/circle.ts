import type { Activity, Circle, GiftingModeInfo } from '../types/wishlist';
export const diwaliCircle: Circle = {
  id: 'diwali-scenes',
  name: 'Santa Party 🎉',
  occasion: 'Diwali',
  date: '2026-11-07',
  venue: "Zoya's terrace, Bandra",
  budget: 2500
};
export const secretDrawRecipientId = 'kabir';
export const giftingModes: GiftingModeInfo[] = [{
  id: 'secret',
  name: 'Draw names privately',
  short: 'Everyone gets one recipient.',
  description: 'Everyone gets one recipient, drawn privately. Nobody knows who has whom until the big day.'
}, {
  id: 'everyone',
  name: 'Gift everyone',
  short: 'Everyone buys for every other member, with a budget per person.',
  description: 'Everyone buys for every other member, with a budget per person. Your checklist stays private.'
}, {
  id: 'browse',
  name: 'Share wishlists only',
  short: 'No assignments. People browse and reserve gifts privately.',
  description: 'No assignments. People browse wishlists and reserve gifts privately.'
}];
export const recentActivity: Activity[] = [{
  id: 'act1',
  memberId: 'zoya',
  kind: 'reacted',
  text: 'said "very you" to',
  target: 'your matcha set',
  ago: '12m'
}, {
  id: 'act2',
  memberId: 'kabir',
  kind: 'added',
  text: 'added',
  target: 'a brick-build bonsai',
  ago: '1h'
}, {
  id: 'act3',
  memberId: 'sam',
  kind: 'joined',
  text: 'joined',
  target: 'Diwali Scenes',
  ago: '3h'
}, {
  id: 'act4',
  memberId: 'rohan',
  kind: 'reacted',
  text: 'said "questionable, but supported" to',
  target: 'your fig candle',
  ago: 'Yesterday'
}];
