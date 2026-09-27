import React, { useId, useState } from 'react';
import { CheckIcon, ImagePlusIcon } from 'lucide-react';
import type { Currency, Desire } from '../../types/wishlist';
import { formatINR, toINR } from '../../utils/money';
import { DesireSelector } from './DesireSelector';
export interface ItemDraft {
  title: string;
  retailer: string;
  url: string;
  price: string;
  currency: Currency;
  image: string;
  note: string;
  desire: Desire;
}
interface ItemFormProps {
  initial: ItemDraft;
  images: string[];
  banner?: React.ReactNode;
  onSubmit: (draft: ItemDraft) => void;
  onStartOver: () => void;
}
const CURRENCIES: Currency[] = ['INR', 'USD', 'GBP', 'EUR'];
const inputCls = 'mt-1.5 h-12 w-full rounded-xl border-2 border-ink bg-white px-3.5 text-base outline-none placeholder:text-ink-mute focus:shadow-chunk-sm';
export function ItemForm({
  initial,
  images,
  banner,
  onSubmit,
  onStartOver
}: ItemFormProps) {
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [touched, setTouched] = useState(false);
  const fileId = useId();
  const manual = images.length === 0;
  const set = <K extends keyof ItemDraft,>(key: K, value: ItemDraft[K]) => setDraft(d => ({
    ...d,
    [key]: value
  }));
  const priceNum = Number(draft.price);
  const priceValid = draft.price === '' || !Number.isNaN(priceNum) && priceNum >= 0;
  const titleError = touched && draft.title.trim() === '';
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (draft.title.trim() === '' || !priceValid) return;
    onSubmit(draft);
  }
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) set('image', URL.createObjectURL(file));
  }
  return <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {banner}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:gap-10">
        {/* Images */}
        <div>
          {manual ? <div>
              <span className="text-sm font-bold">Photo (optional)</span>
              <label htmlFor={fileId} className="mt-1.5 flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[24px] border-2 border-dashed border-ink/40 bg-white text-ink-soft transition-colors duration-150 hover:border-ink">
                {draft.image ? <img src={draft.image} alt="Your uploaded product" className="h-full w-full object-cover" /> : <>
                    <ImagePlusIcon className="h-8 w-8" aria-hidden="true" />
                    <span className="mt-2 font-semibold">Add a photo</span>
                    <span className="text-sm">A screenshot works fine</span>
                  </>}
              </label>
              <input id={fileId} type="file" accept="image/*" onChange={onFile} className="sr-only" />
            </div> : <div>
              <div className="aspect-square overflow-hidden rounded-[24px] border-2 border-ink bg-cream shadow-chunk">
                <img src={draft.image} alt={`Selected photo of ${draft.title || 'product'}`} className="h-full w-full object-cover" />
              </div>
              <fieldset className="mt-4">
                <legend className="text-sm font-bold">Pick the photo friends will see</legend>
                <div className="mt-2 flex gap-2.5">
                  {images.map((src, i) => {
                const active = draft.image === src;
                return <label key={src} className="relative cursor-pointer">
                        <input type="radio" name="photo" checked={active} onChange={() => set('image', src)} className="peer sr-only" />
                        <img src={src} alt={`Photo option ${i + 1}`} className={`h-16 w-16 rounded-xl border-2 object-cover transition-transform duration-150 peer-focus-visible:ring-4 peer-focus-visible:ring-electric/40 ${active ? 'border-ink' : 'border-transparent opacity-70 hover:opacity-100'}`} />
                        {active && <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-coral">
                            <CheckIcon className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                          </span>}
                      </label>;
              })}
                </div>
              </fieldset>
            </div>}
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-5">
          <label className="block">
            <span className="text-sm font-bold">What is it?</span>
            <input value={draft.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Mushroom ceramic lamp" aria-invalid={titleError} className={inputCls} />
            {titleError && <span className="mt-1 block text-sm font-semibold text-coral-deep">Give it a name so friends know what they’re looking at.</span>}
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold">Shop</span>
              <input value={draft.retailer} onChange={e => set('retailer', e.target.value)} placeholder="e.g. Etsy" className={inputCls} />
            </label>
            <div>
              <span className="text-sm font-bold" id="price-label">Price</span>
              <div className="mt-1.5 flex gap-2" role="group" aria-labelledby="price-label">
                <select aria-label="Currency" value={draft.currency} onChange={e => set('currency', e.target.value as Currency)} className="h-12 rounded-xl border-2 border-ink bg-white px-2 font-semibold outline-none focus:shadow-chunk-sm">
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <input inputMode="decimal" aria-label="Amount" value={draft.price} onChange={e => set('price', e.target.value)} placeholder="0" aria-invalid={!priceValid} className="h-12 w-full min-w-0 rounded-xl border-2 border-ink bg-white px-3.5 text-base tabular-nums outline-none focus:shadow-chunk-sm" />
              </div>
              {!priceValid ? <span className="mt-1 block text-sm font-semibold text-coral-deep">Numbers only, please.</span> : draft.currency !== 'INR' && draft.price !== '' ? <span className="mt-1 block text-sm text-ink-soft">
                  ≈ <span className="font-bold text-ink">{formatINR(toINR(priceNum, draft.currency))}</span> at today’s rate
                </span> : null}
            </div>
          </div>

          {manual && <label className="block">
              <span className="text-sm font-bold">Link (optional)</span>
              <input value={draft.url} onChange={e => set('url', e.target.value)} placeholder="https://" className={inputCls} />
            </label>}

          <label className="block">
            <span className="text-sm font-bold">Note for your friends</span>
            <textarea value={draft.note} onChange={e => set('note', e.target.value)} rows={3} placeholder="Size, colour, or just vibes. “The cream one, not the sage.”" className="mt-1.5 w-full resize-none rounded-xl border-2 border-ink bg-white px-3.5 py-3 text-base outline-none placeholder:text-ink-mute focus:shadow-chunk-sm" />
          </label>

          <DesireSelector value={draft.desire} onChange={d => set('desire', d)} />
        </div>
      </div>

      <div className="sticky bottom-0 -mx-5 flex flex-col-reverse gap-2 border-t-2 border-ink bg-paper px-5 py-4 sm:flex-row sm:justify-end lg:static lg:mx-0 lg:border-0 lg:px-0">
        <button type="button" onClick={onStartOver} className="h-12 rounded-2xl px-5 font-bold underline-offset-4 hover:underline">
          Start over
        </button>
        <button type="submit" className="h-14 rounded-2xl border-2 border-ink bg-coral px-8 text-lg font-bold text-ink shadow-chunk transition-transform duration-150 ease-snap active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
          Add item
        </button>
      </div>
    </form>;
}
