import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRightIcon, CheckIcon, ClipboardPasteIcon, LinkIcon, MailOpenIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useShelfie } from '../../contexts/ShelfieContext';
import { EXAMPLE_LINK } from '../../utils/extract';
import { StarterPicksRow } from './StarterPicksRow';
type StepState = 'current' | 'done' | 'upcoming';
function StepDot({
  n,
  state
}: {
  n: number;
  state: StepState;
}) {
  return <span aria-hidden="true" className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-display text-base font-extrabold ${state === 'done' ? 'border-ink bg-ink text-paper' : state === 'current' ? 'border-ink bg-coral text-ink shadow-chunk-sm' : 'border-ink/30 bg-paper text-ink-mute'}`}>
      {state === 'done' ? <CheckIcon className="h-5 w-5" strokeWidth={3} /> : n}
    </span>;
}
export function NewAccountHome() {
  const navigate = useNavigate();
  const {
    items,
    profile
  } = useShelfie();
  const {
    createdGroup
  } = useAuth();
  const [link, setLink] = useState('');
  const firstName = profile.name.split(' ')[0];
  const hasItems = items.length > 0;
  const hasGroup = createdGroup !== '';
  const wishlistState: StepState = hasItems ? 'done' : 'current';
  const groupState: StepState = hasGroup ? 'done' : hasItems ? 'current' : 'upcoming';
  async function paste() {
    try {
      setLink((await navigator.clipboard.readText()) || EXAMPLE_LINK);
    } catch {
      setLink(EXAMPLE_LINK);
    }
  }
  function addFromLink(e: React.FormEvent) {
    e.preventDefault();
    navigate(link.trim() ? `/add?url=${encodeURIComponent(link.trim())}` : '/add');
  }
  return <div className="mx-auto w-full max-w-3xl px-5 pt-6 sm:px-8 lg:pt-10">
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Welcome in, {firstName}.</h1>
        <p className="mt-1 text-lg text-ink-soft">
          {hasGroup ? 'You’re set. Share the invite and let the hints roll in.' : 'Two steps to get your friends gifting you the right stuff.'}
        </p>
      </header>

      <ol className="relative mt-8">
        {/* connector */}
        <span aria-hidden="true" className="absolute bottom-10 left-5 top-10 w-0 border-l-2 border-dashed border-ink/25" />

        {/* Step 1 */}
        <li className="relative flex gap-4 pb-10 sm:gap-5">
          <StepDot n={1} state={wishlistState} />
          <section aria-labelledby="step-wishlist" aria-current={wishlistState === 'current' ? 'step' : undefined} className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink-mute">Step 1 · Your wishlist</p>
            <h2 id="step-wishlist" className="mt-0.5 font-display text-2xl font-extrabold leading-tight sm:text-3xl">
              {hasItems ? `${items.length} ${items.length === 1 ? 'item' : 'items'} on your wishlist` : 'Add something you’d love to get'}
            </h2>

            {hasItems ? <div className="mt-4">
                <ul className="flex gap-3" aria-label="Your items">
                  {items.slice(0, 4).map(item => <li key={item.id} className="h-16 w-16 overflow-hidden rounded-2xl border-2 border-ink bg-white">
                      {item.image ? <img src={item.image} alt={item.title} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center p-1 text-center text-[10px] font-bold">{item.title}</span>}
                    </li>)}
                </ul>
                <p className="mt-3 text-[15px] text-ink-soft">
                  Nice. Three or four gives friends real options.{' '}
                  <Link to="/add" className="font-bold text-ink underline underline-offset-2">
                    Add another
                  </Link>
                </p>
              </div> : <div className="mt-4 rounded-[28px] border-2 border-ink bg-white p-5 shadow-chunk sm:p-6">
                <form onSubmit={addFromLink}>
                  <label htmlFor="home-link" className="text-sm font-bold">
                    Paste a product link from any shop
                  </label>
                  <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                    <div className="flex flex-1 items-center gap-2 rounded-2xl border-2 border-ink bg-cream pl-3.5 pr-1.5 focus-within:bg-white">
                      <LinkIcon className="h-4 w-4 shrink-0 text-ink-mute" aria-hidden="true" />
                      <input id="home-link" type="url" inputMode="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://" className="h-12 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-ink-mute" />
                      <button type="button" onClick={paste} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-bold ring-1 ring-ink/15 hover:ring-ink">
                        <ClipboardPasteIcon className="h-3.5 w-3.5" aria-hidden="true" /> Paste
                      </button>
                    </div>
                    <button type="submit" className="inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-coral px-5 font-bold text-ink shadow-chunk-sm transition-transform duration-150 ease-snap active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
                      Add an item <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-ink-mute">We’ll grab the photo and price. You add a note like size or colour.</p>
                </form>

                <div className="mt-6 border-t-2 border-dashed border-ink/10 pt-5">
                  <StarterPicksRow />
                </div>
              </div>}
          </section>
        </li>

        {/* Step 2 */}
        <li className="relative flex gap-4 sm:gap-5">
          <StepDot n={2} state={groupState} />
          <section aria-labelledby="step-group" aria-current={groupState === 'current' ? 'step' : undefined} className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink-mute">Step 2 · Your people</p>
            <h2 id="step-group" className={`mt-0.5 font-display text-2xl font-extrabold leading-tight sm:text-3xl ${groupState === 'upcoming' ? 'text-ink-soft' : ''}`}>
              {hasGroup ? `${createdGroup} is ready` : 'Create a group for your next occasion'}
            </h2>
            <p className="mt-1.5 text-[15px] text-ink-soft">
              {hasGroup ? 'Share the invite in your group chat. Wishlists appear as friends join.' : 'A birthday, Diwali, a wedding. Friends see your wishlist once they join.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link to="/groups" className={`inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-ink px-5 font-bold transition-transform duration-150 ease-snap ${groupState === 'current' ? 'bg-coral text-ink shadow-chunk-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none' : 'bg-white hover:bg-cream'}`}>
                {hasGroup ? 'Open my groups' : 'Create a group'} <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
              </Link>
              {groupState === 'upcoming' && <span className="text-sm text-ink-mute">You can do this first if you prefer.</span>}
            </div>
            {!hasGroup && <p className="mt-5 flex items-start gap-2.5 text-sm text-ink-soft">
                <MailOpenIcon className="mt-0.5 h-4 w-4 shrink-0 text-electric" aria-hidden="true" />
                Got an invite from a friend? Open their link and you’ll land straight in the group.
              </p>}
          </section>
        </li>
      </ol>
    </div>;
}
