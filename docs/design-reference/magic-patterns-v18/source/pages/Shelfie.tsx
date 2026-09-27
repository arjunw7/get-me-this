import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDownIcon, CheckIcon, EyeOffIcon, PencilIcon, PlusIcon, Share2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '../components/Avatar';
import { ReactionSummary } from '../components/ReactionBar';
import { EditProfileSheet } from '../components/shelfie/EditProfileSheet';
import { ShelfieEmpty } from '../components/shelfie/ShelfieEmpty';
import { ShelfieReorderList } from '../components/shelfie/ShelfieReorderList';
import { ShelfieCard } from '../components/ShelfieCard';
import { useShelfie } from '../contexts/ShelfieContext';
import { getMember, ME_ID } from '../data/members';
import { accentFill, accentLabels } from '../utils/accent';
const ASPECTS = ['aspect-[4/5]', 'aspect-square', 'aspect-[3/4]', 'aspect-[5/4]'];
const TILTS = ['', 'lg:rotate-[0.6deg]', '', 'lg:-rotate-[0.6deg]'];
export function Shelfie() {
  const {
    items,
    profile,
    theme
  } = useShelfie();
  const [editing, setEditing] = useState(false);
  const [reordering, setReordering] = useState(false);
  const me = getMember(ME_ID);
  function share() {
    navigator.clipboard?.writeText('https://getmethis.app/s/aanya').catch(() => undefined);
    toast('Wishlist link copied. Only your groups can open it.');
  }
  return <div className="mx-auto w-full max-w-6xl px-5 pt-6 sm:px-8 lg:pt-10">
      {/* Profile */}
      <section aria-labelledby="shelfie-name" className="relative rounded-[32px] border-2 border-ink bg-white shadow-chunk">
        <div className={`h-24 rounded-t-[30px] border-b-2 border-ink sm:h-28 ${accentFill[theme]}`} aria-hidden="true">
          <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="h-full w-full opacity-30">
            <path d="M-10 70 C 60 20, 110 100, 180 55 S 300 10, 410 60" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-end sm:justify-between sm:px-7">
          <div className="-mt-12 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-5">
            <Avatar member={me} size="xl" colorOverride={theme} className="shadow-chunk-sm ring-4 ring-white" />
            <div>
              <h1 id="shelfie-name" className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                {profile.name}
              </h1>
              <p className="mt-0.5 text-lg text-ink-soft">{profile.line}</p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm text-ink-mute">
                <span className={`h-3 w-3 rounded-full border border-ink ${accentFill[theme]}`} aria-hidden="true" />
                {accentLabels[theme]} theme · {items.length} {items.length === 1 ? 'thing' : 'things'} · visible to 2 groups
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-ink bg-white px-4 text-sm font-bold transition-colors duration-150 hover:bg-cream">
              <PencilIcon className="h-4 w-4" aria-hidden="true" /> Edit profile
            </button>
            <button type="button" onClick={share} aria-label="Share wishlist link" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-white transition-colors duration-150 hover:bg-cream">
              <Share2Icon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      {items.length > 0 && <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-sm text-ink-soft">
            <EyeOffIcon className="h-4 w-4" aria-hidden="true" />
            You’ll never see what’s been reserved. That’s the point.
          </p>
          <div className="flex gap-2">
            <button type="button" aria-pressed={reordering} onClick={() => setReordering(r => !r)} className={`inline-flex h-11 items-center gap-2 rounded-xl border-2 border-ink px-4 text-sm font-bold transition-colors duration-150 ${reordering ? 'bg-ink text-paper' : 'bg-white hover:bg-cream'}`}>
              {reordering ? <CheckIcon className="h-4 w-4" aria-hidden="true" /> : <ArrowUpDownIcon className="h-4 w-4" aria-hidden="true" />}
              {reordering ? 'Done' : 'Reorder'}
            </button>
            <Link to="/add" className="hidden h-11 items-center gap-2 rounded-xl border-2 border-ink bg-coral px-4 text-sm font-bold text-ink sm:inline-flex lg:hidden">
              <PlusIcon className="h-4 w-4" aria-hidden="true" /> Add an item
            </Link>
          </div>
        </div>}

      <div className="mt-6">
        {items.length === 0 ? <ShelfieEmpty /> : reordering ? <div className="max-w-2xl">
            <ShelfieReorderList />
          </div> : <div className="columns-1 gap-6 min-[480px]:columns-2 lg:columns-3">
            {items.map((item, i) => <div key={item.id} className="mb-7 break-inside-avoid">
                <ShelfieCard product={item} aspect={ASPECTS[i % ASPECTS.length]} tilt={TILTS[i % TILTS.length]} tape={i % 3 === 1}>
                  <ReactionSummary counts={item.reactions} />
                </ShelfieCard>
              </div>)}
          </div>}
      </div>

      <EditProfileSheet open={editing} onClose={() => setEditing(false)} />
    </div>;
}
