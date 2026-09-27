import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, LockIcon } from 'lucide-react';
import { useCircle } from '../../contexts/CircleContext';
import { secretDrawRecipientId } from '../../data/circle';
import { getMember, members } from '../../data/members';
import { products } from '../../data/products';
import { Avatar } from '../Avatar';
import { AvatarStack } from '../AvatarStack';
export function PrivateAssignmentCard() {
  const {
    mode,
    reservations
  } = useCircle();
  const kabir = getMember(secretDrawRecipientId);
  const recipients = members.filter(m => !m.isMe && m.status === 'joined');
  if (mode === 'browse') {
    return <section className="rounded-[28px] border-2 border-dashed border-ink/40 bg-white p-6">
        <h2 className="font-display text-2xl font-extrabold">No assignments this time.</h2>
        <p className="mt-2 text-ink-soft">Diwali Scenes is sharing wishlists only. Reserve anything you like, whenever you like.</p>
        <Link to="/groups/diwali-scenes" className="mt-4 inline-flex h-11 items-center gap-2 font-bold underline-offset-4 hover:underline">
          Browse wishlists <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
        </Link>
      </section>;
  }
  const sortedCount = recipients.filter(r => products.some(p => p.ownerId === r.id && reservations.has(p.id))).length;
  return <section aria-label="Your private gifting assignment" className="relative overflow-hidden rounded-[28px] border-2 border-ink bg-ink p-6 text-paper shadow-chunk sm:p-7">
      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-paper/75">
        <LockIcon className="h-4 w-4" aria-hidden="true" />
        Only you can see this
      </p>
      {mode === 'secret' ? <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl font-extrabold leading-[0.95] sm:text-5xl">You got Kabir.</h2>
            <p className="mt-1 font-display text-2xl font-bold text-coral sm:text-3xl">Act surprised.</p>
          </div>
          <Avatar member={kabir} size="lg" className="-rotate-6 border-paper" />
        </div> : <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl font-extrabold leading-[0.95] sm:text-5xl">
              {recipients.length} people to spoil.
            </h2>
            <p className="mt-1 font-display text-2xl font-bold text-coral sm:text-3xl">
              {sortedCount} sorted, {recipients.length - sortedCount} to go.
            </p>
          </div>
          <AvatarStack members={recipients} size="sm" />
        </div>}
      <Link to="/groups/diwali-scenes/gifting" className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-paper bg-coral px-5 font-bold text-ink transition-transform duration-150 ease-snap hover:-translate-y-0.5">
        {mode === 'secret' ? "See Kabir's wishlist" : 'Open my checklist'}
        <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>;
}
