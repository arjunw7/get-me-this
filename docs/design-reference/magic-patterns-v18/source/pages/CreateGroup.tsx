import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckIcon, LinkIcon, MessageCircleIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { giftingModes } from '../data/circle';
import type { Currency, GiftingMode } from '../types/wishlist';
const OCCASIONS = ['Diwali', 'Eid', 'Birthday', 'Wedding', 'Housewarming', 'Secret Santa', 'Something else'];
const CURRENCIES: Currency[] = ['INR', 'USD', 'GBP', 'EUR'];
const inputCls = 'mt-1.5 h-12 w-full rounded-xl border-2 border-ink bg-white px-3.5 text-base outline-none placeholder:text-ink-mute focus:shadow-chunk-sm';
export function CreateGroup() {
  const navigate = useNavigate();
  const {
    createGroup
  } = useAuth();
  const [params] = useSearchParams();
  const occasionParam = params.get('occasion');
  const [name, setName] = useState(params.get('name') ?? '');
  const [occasion, setOccasion] = useState(occasionParam && OCCASIONS.includes(occasionParam) ? occasionParam : 'Birthday');
  const [date, setDate] = useState('');
  const [budget, setBudget] = useState('2500');
  const [currency, setCurrency] = useState<Currency>('INR');
  const [mode, setMode] = useState<GiftingMode>('secret');
  const [touched, setTouched] = useState(false);
  const [created, setCreated] = useState(false);
  const nameError = touched && name.trim() === '';
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'your-group';
  const inviteUrl = `https://getmethis.app/invite/${slug}`;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (name.trim() === '') return;
    createGroup(name.trim());
    setCreated(true);
  }
  function copy() {
    navigator.clipboard?.writeText(inviteUrl).catch(() => undefined);
    toast('Invite link copied');
  }
  return <div className="min-h-screen w-full bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5">
          <p className="font-display text-lg font-extrabold">Create a group</p>
          <button type="button" onClick={() => navigate('/home')} aria-label="Close" className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink bg-white hover:bg-cream">
            <XIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-8 sm:py-12">
        {created ? <div>
            <span className="inline-flex h-16 w-16 -rotate-6 items-center justify-center rounded-full border-2 border-ink bg-lime shadow-chunk-sm">
              <CheckIcon className="h-8 w-8" strokeWidth={3} aria-hidden="true" />
            </span>
            <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1] tracking-tight sm:text-5xl">{name.trim()} is ready.</h1>
            <p className="mt-3 text-lg text-ink-soft">Now bring your people. Anyone with the link can see the group and join.</p>
            <div className="mt-8 rounded-[24px] border-2 border-ink bg-white p-5 shadow-chunk">
              <p className="text-sm font-bold">Invite link</p>
              <p className="mt-1.5 truncate rounded-xl bg-cream px-3 py-3 font-semibold">{inviteUrl.replace('https://', '')}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={copy} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-ink bg-ink font-bold text-paper">
                  <LinkIcon className="h-4 w-4" aria-hidden="true" /> Copy invite link
                </button>
                <a href={`https://wa.me/?text=${encodeURIComponent(`Join ${name.trim()} on Get Me This: ${inviteUrl}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-ink bg-white font-bold">
                  <MessageCircleIcon className="h-4 w-4" aria-hidden="true" /> Share on WhatsApp
                </a>
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-2 sm:flex-row">
              <Link to="/wishlist" className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-ink bg-coral px-6 font-bold">
                Add to my wishlist
              </Link>
              <Link to="/home" className="inline-flex h-12 items-center justify-center rounded-2xl px-6 font-bold underline-offset-4 hover:underline">
                Go to home
              </Link>
            </div>
          </div> : <form onSubmit={submit} noValidate className="flex flex-col gap-7">
            <div>
              <h1 className="font-display text-4xl font-extrabold leading-[1] tracking-tight sm:text-5xl">What are we celebrating?</h1>
              <p className="mt-3 text-lg text-ink-soft">You can change any of this later.</p>
            </div>

            <label className="block">
              <span className="text-sm font-bold">Group name</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rohan turns 27" aria-invalid={nameError} className={`${inputCls} ${nameError ? '!border-coral-deep' : ''}`} />
              {nameError && <span className="mt-1 block text-sm font-semibold text-coral-deep">Give it a name so people recognise the invite.</span>}
            </label>

            <fieldset>
              <legend className="text-sm font-bold">Occasion</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {OCCASIONS.map(o => <label key={o} className="cursor-pointer">
                    <input type="radio" name="occasion" checked={occasion === o} onChange={() => setOccasion(o)} className="peer sr-only" />
                    <span className={`inline-flex h-11 items-center rounded-full border-2 px-4 text-sm font-bold transition-colors duration-150 peer-focus-visible:ring-4 peer-focus-visible:ring-electric/40 ${occasion === o ? 'border-ink bg-ink text-paper' : 'border-ink/20 bg-white hover:border-ink'}`}>
                      {o}
                    </span>
                  </label>)}
              </div>
            </fieldset>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-bold">Date</span>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
              </label>
              <div>
                <span id="budget-label" className="text-sm font-bold">Budget per person</span>
                <div className="mt-1.5 flex gap-2" role="group" aria-labelledby="budget-label">
                  <select aria-label="Currency" value={currency} onChange={e => setCurrency(e.target.value as Currency)} className="h-12 rounded-xl border-2 border-ink bg-white px-2 font-semibold outline-none focus:shadow-chunk-sm">
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input inputMode="numeric" aria-label="Amount" value={budget} onChange={e => setBudget(e.target.value.replace(/\D/g, ''))} className="h-12 w-full min-w-0 rounded-xl border-2 border-ink bg-white px-3.5 text-base tabular-nums outline-none focus:shadow-chunk-sm" />
                </div>
              </div>
            </div>

            <fieldset>
              <legend className="text-sm font-bold">How should people gift?</legend>
              <div className="mt-2 flex flex-col gap-2">
                {giftingModes.map(m => <label key={m.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-colors duration-150 ${mode === m.id ? 'border-ink bg-marigold-soft shadow-chunk-sm' : 'border-ink/20 bg-white hover:border-ink'}`}>
                    <input type="radio" name="mode" checked={mode === m.id} onChange={() => setMode(m.id)} className="mt-1 h-5 w-5 shrink-0 accent-[#17140F]" />
                    <span>
                      <span className="block font-display text-lg font-bold">{m.name}</span>
                      <span className="block text-sm text-ink-soft">{m.short}</span>
                    </span>
                  </label>)}
              </div>
              <p className="mt-3 text-sm text-ink-mute">In every style, reservations stay invisible to the person receiving.</p>
            </fieldset>

            <button type="submit" className="h-14 rounded-2xl border-2 border-ink bg-coral text-lg font-bold text-ink shadow-chunk transition-transform duration-150 ease-snap active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
              Create group
            </button>
          </form>}
      </main>
    </div>;
}
