import type { Currency } from '../types/wishlist';

const RETAILERS: Record<string, { name: string; currency: Currency }> = {
  etsy: { name: 'Etsy', currency: 'USD' },
  mejuri: { name: 'Mejuri', currency: 'USD' },
  zara: { name: 'Zara', currency: 'EUR' },
  asos: { name: 'ASOS', currency: 'GBP' },
  amazon: { name: 'Amazon.in', currency: 'INR' },
  myntra: { name: 'Myntra', currency: 'INR' },
  nykaa: { name: 'Nykaa', currency: 'INR' },
  flipkart: { name: 'Flipkart', currency: 'INR' },
  ajio: { name: 'AJIO', currency: 'INR' },
  uniqlo: { name: 'Uniqlo', currency: 'INR' },
  nicobar: { name: 'Nicobar', currency: 'INR' },
};

export type LinkCheck =
  | { kind: 'invalid' }
  | { kind: 'unsupported'; url: string; retailerGuess: string }
  | { kind: 'ok'; url: string; retailer: string; currency: Currency };

export function checkLink(raw: string): LinkCheck {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return { kind: 'invalid' };
  }
  if (!url.hostname.includes('.')) return { kind: 'invalid' };
  const host = url.hostname.replace(/^www\./, '');
  const key = Object.keys(RETAILERS).find((k) => host.includes(k));
  const guess = host.split('.')[0];
  if (!key) {
    return { kind: 'unsupported', url: url.toString(), retailerGuess: guess.charAt(0).toUpperCase() + guess.slice(1) };
  }
  return { kind: 'ok', url: url.toString(), retailer: RETAILERS[key].name, currency: RETAILERS[key].currency };
}

export const EXTRACTED_IMAGES = [
  'https://cdn.magicpatterns.com/patterns/generated-images/820c59bf-fda3-4512-9919-4ea3a6330dbf.jpg',
  'https://cdn.magicpatterns.com/patterns/generated-images/a785bf6d-5778-4219-b721-6c105e49ae24.jpg',
  'https://cdn.magicpatterns.com/patterns/generated-images/0a86a586-2b38-4c2c-b4f9-c480597eedce.jpg',
];

export const EXAMPLE_LINK = 'https://www.etsy.com/listing/1428801/mushroom-ceramic-table-lamp';

export function extractedPrice(currency: Currency): number {
  return { INR: 4499, USD: 64, GBP: 52, EUR: 59 }[currency];
}
