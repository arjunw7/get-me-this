import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { useCircle } from '../../contexts/CircleContext';
import { diwaliCircle } from '../../data/circle';
import { members } from '../../data/members';
import { productsFor } from '../../data/products';
import { formatINR } from '../../utils/money';
import { Avatar } from '../Avatar';
import { GiftList } from './GiftList';
export function RecipientChecklist() {
  const {
    reservations
  } = useCircle();
  const recipients = members.filter(m => !m.isMe && m.status === 'joined');
  const pending = members.filter(m => m.status === 'pending');
  const [open, setOpen] = useState<string | null>(recipients[0]?.id ?? null);
  const sortedIds = recipients.filter(r => productsFor(r.id).some(p => reservations.has(p.id))).map(r => r.id);
  const progress = recipients.length ? sortedIds.length / recipients.length : 0;
  return <div>
      <div className="flex items-center gap-4">
        <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-ink bg-white" role="progressbar" aria-valuemin={0} aria-valuemax={recipients.length} aria-valuenow={sortedIds.length} aria-label="Recipients sorted">
          <motion.div className="h-full bg-electric" initial={false} animate={{
          width: `${progress * 100}%`
        }} transition={{
          duration: 0.25,
          ease: [0.23, 1, 0.32, 1]
        }} />
        </div>
        <p className="shrink-0 text-sm font-bold tabular-nums">
          {sortedIds.length} of {recipients.length} sorted
        </p>
      </div>

      <ul className="mt-6 flex flex-col gap-3">
        {recipients.map(r => {
        const items = productsFor(r.id);
        const done = sortedIds.includes(r.id);
        const expanded = open === r.id;
        return <li key={r.id} className={`overflow-hidden rounded-[24px] border-2 border-ink bg-white ${expanded ? 'shadow-chunk' : ''}`}>
              <button type="button" aria-expanded={expanded} aria-controls={`recipient-${r.id}`} onClick={() => setOpen(expanded ? null : r.id)} className="flex w-full items-center gap-3 p-4 text-left transition-colors duration-150 hover:bg-cream/50 sm:gap-4">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink ${done ? 'bg-electric text-white' : 'bg-white'}`} aria-hidden="true">
                  {done && <CheckIcon className="h-4 w-4" strokeWidth={3} />}
                </span>
                <Avatar member={r} />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg font-bold">{r.firstName}</span>
                  <span className="block truncate text-sm text-ink-soft">
                    {done ? 'Sorted. Nicely done.' : `${items.length} ideas · ${formatINR(diwaliCircle.budget)} budget`}
                  </span>
                </span>
                <span className="hidden shrink-0 -space-x-3 sm:flex" aria-hidden="true">
                  {items.slice(0, 3).map(p => <img key={p.id} src={p.image} alt="" className="h-11 w-11 rounded-xl border-2 border-white object-cover" />)}
                </span>
                <ChevronDownIcon className={`h-5 w-5 shrink-0 transition-transform duration-200 ease-snap ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              <AnimatePresence initial={false}>
                {expanded && <motion.div id={`recipient-${r.id}`} initial={{
              height: 0,
              opacity: 0
            }} animate={{
              height: 'auto',
              opacity: 1
            }} exit={{
              height: 0,
              opacity: 0
            }} transition={{
              duration: 0.24,
              ease: [0.23, 1, 0.32, 1]
            }}>
                    <div className="border-t-2 border-dashed border-ink/15 p-4 sm:p-5">
                      <p className="mb-5 text-[15px] italic text-ink-soft">“{r.tagline}”</p>
                      <GiftList recipient={r} items={items} budget={diwaliCircle.budget} />
                    </div>
                  </motion.div>}
              </AnimatePresence>
            </li>;
      })}
        {pending.map(p => <li key={p.id} className="flex items-center gap-4 rounded-[24px] border-2 border-dashed border-ink/25 p-4">
            <span className="h-7 w-7 shrink-0 rounded-lg border-2 border-dashed border-ink/30" aria-hidden="true" />
            <Avatar member={p} />
            <span>
              <span className="block font-display text-lg font-bold text-ink-soft">{p.firstName}</span>
              <span className="block text-sm text-ink-mute">Hasn’t joined yet. Their wishlist will appear here.</span>
            </span>
          </li>)}
      </ul>
    </div>;
}
