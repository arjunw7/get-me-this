import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeftIcon, ArrowRightIcon, ChevronDownIcon, LinkIcon, MapPinIcon, MessageCircleIcon, SlidersHorizontalIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar } from '../components/Avatar';
import { MemberShelfieRow } from '../components/circle/MemberShelfieRow';
import { OrganizerTools } from '../components/circle/OrganizerTools';
import { ModePill } from '../components/ModePill';
import { useCircle } from '../contexts/CircleContext';
import { useShelfie } from '../contexts/ShelfieContext';
import { diwaliCircle, secretDrawRecipientId } from '../data/circle';
import { getMember, ME_ID, members } from '../data/members';
import { productsFor } from '../data/products';
import { daysUntil, formatEventDate } from '../utils/dates';
import { formatINR } from '../utils/money';
const INVITE_URL = 'https://getmethis.app/invite/diwali-scenes';
function Sparkle({
  className
}: {
  className: string;
}) {
  return <svg aria-hidden="true" viewBox="0 0 40 40" className={className}>
      <path d="M20 3 C21 14, 26 19, 37 20 C26 21, 21 26, 20 37 C19 26, 14 21, 3 20 C14 19, 19 14, 20 3 Z" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>;
}
export function CircleRoom() {
  const {
    mode
  } = useCircle();
  const {
    items: myItems
  } = useShelfie();
  const [toolsOpen, setToolsOpen] = useState(false);
  const days = daysUntil(diwaliCircle.date);
  const me = getMember(ME_ID);
  const joined = members.filter(m => m.status === 'joined');
  const pending = members.filter(m => m.status === 'pending');
  const others = joined.filter(m => !m.isMe);
  const ordered = mode === 'secret' ? [...others].sort((a, b) => a.id === secretDrawRecipientId ? -1 : b.id === secretDrawRecipientId ? 1 : 0) : others;
  function shareInvite() {
    navigator.clipboard?.writeText(INVITE_URL).catch(() => undefined);
    toast('Invite link copied. Drop it in the group chat.');
  }
  const banner = {
    secret: {
      title: 'Names have been drawn.',
      body: 'Only you know who you got. Keep that poker face.',
      cta: 'Open my gift plan'
    },
    everyone: {
      title: `${others.length} people on your list.`,
      body: `${formatINR(diwaliCircle.budget)} each. Your checklist is private.`,
      cta: 'Open my checklist'
    },
    browse: {
      title: 'No assignments, no pressure.',
      body: 'Scroll, react, and reserve anything. Recipients never see it.',
      cta: ''
    }
  }[mode];
  return <div className="mx-auto w-full max-w-6xl px-5 pt-4 sm:px-8 lg:pt-10">
      <Link to="/home" className="inline-flex h-11 items-center gap-1.5 text-sm font-bold">
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> Home
      </Link>

      {/* Header */}
      <header className="relative overflow-hidden rounded-[32px] border-2 border-ink bg-marigold p-6 shadow-chunk sm:p-8">
        <Sparkle className="absolute right-6 top-5 h-10 w-10 text-ink/70" />
        <Sparkle className="absolute right-20 top-16 h-5 w-5 text-ink/50" />
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <ModePill mode={mode} />
            <h1 className="mt-4 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">{diwaliCircle.name}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] font-semibold">
              <span>{formatEventDate(diwaliCircle.date)}</span>
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="h-4 w-4" aria-hidden="true" />
                {diwaliCircle.venue}
              </span>
            </p>
          </div>
          <dl className="flex gap-8">
            <div>
              <dt className="text-sm font-semibold">Countdown</dt>
              <dd className="font-display text-4xl font-extrabold tabular-nums sm:text-5xl">{days} days</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold">Budget</dt>
              <dd className="font-display text-4xl font-extrabold tabular-nums sm:text-5xl">{formatINR(diwaliCircle.budget)}</dd>
              <dd className="text-sm font-semibold">per person</dd>
            </div>
          </dl>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" onClick={shareInvite} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-ink bg-ink px-4 text-sm font-bold text-paper">
            <LinkIcon className="h-4 w-4" aria-hidden="true" /> Copy invite link
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(`Join ${diwaliCircle.name} on Get Me This: ${INVITE_URL}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-ink bg-paper px-4 text-sm font-bold">
            <MessageCircleIcon className="h-4 w-4" aria-hidden="true" /> Share on WhatsApp
          </a>
          {me.isOrganizer && <button type="button" aria-expanded={toolsOpen} aria-controls="organizer-tools" onClick={() => setToolsOpen(o => !o)} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-ink bg-paper px-4 text-sm font-bold">
              <SlidersHorizontalIcon className="h-4 w-4" aria-hidden="true" /> Organizer tools
              <ChevronDownIcon className={`h-4 w-4 transition-transform duration-200 ease-snap ${toolsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>}
        </div>
      </header>

      <AnimatePresence initial={false}>
        {toolsOpen && <motion.div id="organizer-tools" initial={{
        height: 0,
        opacity: 0
      }} animate={{
        height: 'auto',
        opacity: 1
      }} exit={{
        height: 0,
        opacity: 0
      }} transition={{
        duration: 0.22,
        ease: [0.23, 1, 0.32, 1]
      }} className="overflow-hidden">
            <div className="pt-4">
              <OrganizerTools />
            </div>
          </motion.div>}
      </AnimatePresence>

      {/* Members */}
      <section aria-labelledby="members-title" className="mt-8">
        <h2 id="members-title" className="font-display text-xl font-extrabold">
          Who’s in <span className="font-sans text-base font-semibold text-ink-mute">· {joined.length} joined, {pending.length} invited</span>
        </h2>
        <ul className="no-scrollbar -mx-5 mt-3 flex gap-4 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8">
          {members.map(m => <li key={m.id} className="flex w-16 shrink-0 flex-col items-center text-center">
              <Avatar member={m} size="lg" />
              <span className="mt-1.5 w-full truncate text-sm font-semibold">{m.isMe ? 'You' : m.firstName}</span>
              <span className={`text-xs ${m.status === 'pending' ? 'font-semibold text-ink-mute' : 'text-ink-mute'}`}>
                {m.status === 'pending' ? 'Invited' : m.isOrganizer ? 'Organizer' : 'Joined'}
              </span>
            </li>)}
        </ul>
      </section>

      {/* Assignment banner */}
      <section className="mt-6 flex flex-col gap-4 rounded-[24px] border-2 border-ink bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-extrabold">{banner.title}</h2>
          <p className="text-[15px] text-ink-soft">{banner.body}</p>
        </div>
        {banner.cta && <Link to="/groups/diwali-scenes/gifting" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-marigold px-5 font-bold text-ink shadow-chunk-sm">
            {banner.cta} <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </Link>}
      </section>

      {/* Wishlists */}
      <section aria-labelledby="wishlists-title" className="mt-10">
        <h2 id="wishlists-title" className="sr-only">Member wishlists</h2>
        <div className="flex flex-col gap-10">
          {ordered.map(m => <MemberShelfieRow key={m.id} member={m} items={productsFor(m.id)} isMyDraw={mode === 'secret' && m.id === secretDrawRecipientId} />)}
          <MemberShelfieRow member={me} items={myItems} />
        </div>
        {pending.length > 0 && <p className="mt-10 rounded-2xl border-2 border-dashed border-ink/25 p-5 text-ink-soft">
            {pending.map(p => p.firstName).join(' and ')} haven’t joined yet. Their wishlists show up here once they do.
          </p>}
      </section>
    </div>;
}
