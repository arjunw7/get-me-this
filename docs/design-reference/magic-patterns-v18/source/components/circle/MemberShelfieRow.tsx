import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, CheckIcon, EyeOffIcon } from 'lucide-react';
import { useCircle } from '../../contexts/CircleContext';
import type { Member, Product } from '../../types/wishlist';
import { Avatar } from '../Avatar';
import { ReactionBar, ReactionSummary } from '../ReactionBar';
import { ShelfieCard } from '../ShelfieCard';
interface MemberShelfieRowProps {
  member: Member;
  items: Product[];
  isMyDraw?: boolean;
}
export function MemberShelfieRow({
  member,
  items,
  isMyDraw = false
}: MemberShelfieRowProps) {
  const {
    isReserved
  } = useCircle();
  const headingId = `shelfie-${member.id}`;
  return <section aria-labelledby={headingId} className="border-t-2 border-ink/10 pt-8 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar member={member} />
          <div className="min-w-0">
            <h3 id={headingId} className="flex flex-wrap items-center gap-2 font-display text-xl font-extrabold">
              {member.isMe ? 'Your wishlist' : `${member.firstName}'s wishlist`}
              {isMyDraw && <span className="rounded-full bg-ink px-2 py-0.5 font-sans text-[11px] font-bold text-paper">Your draw</span>}
            </h3>
            <p className="truncate text-sm text-ink-soft">{member.isMe ? 'Friends react here. Reservations stay hidden from you.' : member.tagline}</p>
          </div>
        </div>
        {isMyDraw && <Link to="/groups/diwali-scenes/gifting" className="inline-flex h-11 items-center gap-1.5 text-sm font-bold underline-offset-4 hover:underline">
            Open gift plan <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </Link>}
      </div>

      {items.length === 0 ? <p className="mt-4 rounded-2xl border-2 border-dashed border-ink/25 p-5 text-ink-soft">
          Nothing here yet. {member.isMe ? 'Add a few things so nobody panic-buys.' : `Maybe nudge ${member.firstName}?`}
        </p> : <ul className="no-scrollbar -mx-5 mt-4 flex snap-x scroll-px-5 gap-5 overflow-x-auto px-5 pb-3 pt-1 sm:-mx-8 sm:scroll-px-8 sm:px-8">
          {items.map(p => {
        const mine = isReserved(p.id);
        const badge = member.isMe ? null : p.reservedByOther ? <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-white px-2.5 py-1 text-xs font-bold">
                <EyeOffIcon className="h-3.5 w-3.5" aria-hidden="true" /> Someone’s on it
              </span> : mine ? <span className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-lime px-2.5 py-1 text-xs font-bold">
                <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> Reserved by you
              </span> : null;
        return <li key={p.id} className="w-[264px] shrink-0 snap-start sm:w-[280px]">
                <ShelfieCard product={p} aspect="aspect-square" compact badge={badge}>
                  {member.isMe ? <ReactionSummary counts={p.reactions} /> : <ReactionBar counts={p.reactions} productTitle={p.title} ownerId={member.id} />}
                </ShelfieCard>
              </li>;
      })}
        </ul>}
    </section>;
}
