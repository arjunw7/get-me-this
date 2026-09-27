export type Currency = 'INR' | 'USD' | 'GBP' | 'EUR';
export type Desire = 'really' | 'love' | 'idea';
export type GiftingMode = 'secret' | 'everyone' | 'browse';
export type AccentColor = 'coral' | 'marigold' | 'electric' | 'lime';
export type ReactionKey = 'veryYou' | 'questionable' | 'wantToo';

export interface Member {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  color: AccentColor | 'ink';
  status: 'joined' | 'pending';
  tagline: string;
  tastes?: string[];
  sizes?: string;
  isMe?: boolean;
  isOrganizer?: boolean;
}

export interface Product {
  id: string;
  ownerId: string;
  title: string;
  retailer: string;
  price: number;
  currency: Currency;
  image: string;
  note?: string;
  desire: Desire;
  url: string;
  reservedByOther?: boolean;
  reactions?: Partial<Record<ReactionKey, number>>;
}

export interface Activity {
  id: string;
  memberId: string;
  kind: 'added' | 'reacted' | 'joined';
  text: string;
  target?: string;
  ago: string;
}

export interface Circle {
  id: string;
  name: string;
  occasion: string;
  date: string;
  venue: string;
  budget: number;
}

export interface GiftingModeInfo {
  id: GiftingMode;
  name: string;
  short: string;
  description: string;
}
