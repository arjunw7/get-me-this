import React from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowRightIcon, CalendarIcon, MapPinIcon, PlusIcon, WalletIcon } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { AvatarStack } from '../components/AvatarStack';
import { NewAccountHome } from '../components/home/NewAccountHome';
import { PrivateAssignmentCard } from '../components/home/PrivateAssignmentCard';
import { useAuth } from '../contexts/AuthContext';
import { ModePill } from '../components/ModePill';
import { useCircle } from '../contexts/CircleContext';
import { useShelfie } from '../contexts/ShelfieContext';
import { diwaliCircle, recentActivity } from '../data/circle';
import { getMember, ME_ID, members } from '../data/members';
import { daysUntil, formatEventDate } from '../utils/dates';
import { formatINR } from '../utils/money';
export function Home() {
  const {
    mode
  } = useCircle();
  const {
    profile,
    theme,
    items
  } = useShelfie();
  const me = getMember(ME_ID);
  const days = daysUntil(diwaliCircle.date);
  const joined = members.filter(m => m.status === 'joined');
  const firstName = profile.name.split(' ')[0];
  const {
    isFreshAccount
  } = useAuth();
  if (isFreshAccount) return <NewAccountHome />;
  return <div className="mx-auto w-full max-w-6xl px-5 pt-6 sm:px-8 lg:pt-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink-mute">{format(new Date(), 'EEEE, d MMMM')}</p>
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Hey {firstName}.</h1>
        </div>
        <Link to="/wishlist" aria-label="Go to My wishlist" className="lg:hidden">
          <Avatar member={me} colorOverride={theme} />
        </Link>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr] lg:gap-8">
        <div className="flex flex-col gap-6">
          {/* Upcoming circle */}
          <section aria-labelledby="upcoming-title" className="rounded-[28px] border-2 border-ink bg-white p-6 shadow-chunk sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink-mute">Up next</p>
                <h2 id="upcoming-title" className="mt-0.5 font-display text-3xl font-extrabold tracking-tight">
                  {diwaliCircle.name}
                </h2>
              </div>
              <ModePill mode={mode} />
            </div>

            <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
              <p className="leading-none">
                <span className="font-display text-7xl font-extrabold tabular-nums text-coral-deep">{days}</span>
                <span className="ml-2 font-display text-2xl font-bold">days to go</span>
              </p>
              <dl className="grid gap-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Date</dt>
                  <CalendarIcon className="h-4 w-4 text-ink-mute" aria-hidden="true" />
                  <dd className="font-semibold">{formatEventDate(diwaliCircle.date)}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Where</dt>
                  <MapPinIcon className="h-4 w-4 text-ink-mute" aria-hidden="true" />
                  <dd>{diwaliCircle.venue}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="sr-only">Budget</dt>
                  <WalletIcon className="h-4 w-4 text-ink-mute" aria-hidden="true" />
                  <dd>{formatINR(diwaliCircle.budget)} per person</dd>
                </div>
              </dl>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t-2 border-dashed border-ink/15 pt-5">
              <div className="flex items-center gap-3">
                <AvatarStack members={members} max={5} />
                <span className="text-sm text-ink-soft">
                  {joined.length} in, {members.length - joined.length} invited
                </span>
              </div>
              <Link to="/groups/diwali-scenes" className="inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-ink bg-white px-5 font-bold transition-colors duration-150 hover:bg-cream">
                Open group <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </section>

          <PrivateAssignmentCard />
        </div>

        <div className="flex flex-col gap-6">
          {/* Recent activity */}
          <section aria-labelledby="activity-title">
            <div className="flex items-baseline justify-between">
              <h2 id="activity-title" className="font-display text-xl font-extrabold">Since you last looked</h2>
              <Link to="/groups/diwali-scenes" className="text-sm font-bold underline-offset-4 hover:underline">
                See group
              </Link>
            </div>
            <ul className="mt-3 divide-y-2 divide-dashed divide-ink/10 rounded-[24px] border-2 border-ink bg-white px-4">
              {recentActivity.map(a => {
              const m = getMember(a.memberId);
              return <li key={a.id} className="flex items-start gap-3 py-3.5">
                    <Avatar member={m} size="sm" />
                    <p className="flex-1 text-[15px] leading-snug">
                      <span className="font-bold">{m.firstName}</span> {a.text}{' '}
                      <span className="font-semibold">{a.target}</span>
                    </p>
                    <span className="shrink-0 text-xs font-semibold text-ink-mute">{a.ago}</span>
                  </li>;
            })}
            </ul>
          </section>

          {/* Refresh prompt */}
          <section aria-labelledby="refresh-title" className="rounded-[24px] border-2 border-dashed border-ink/40 bg-cream p-5">
            <h2 id="refresh-title" className="font-display text-xl font-extrabold leading-tight">
              {items.length === 0 ? 'Your wishlist is empty. Your friends are guessing.' : 'Still into all of this?'}
            </h2>
            <p className="mt-1.5 text-[15px] text-ink-soft">
              {items.length === 0 ? 'Add a few things before Diwali Scenes so nobody panic-buys a candle.' : 'Your wishlist hasn’t changed in 3 weeks. Tastes move fast. Give it a quick refresh before Diwali.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/add" className="inline-flex h-11 items-center gap-1.5 rounded-xl border-2 border-ink bg-coral px-4 text-sm font-bold text-ink">
                <PlusIcon className="h-4 w-4" aria-hidden="true" /> Add an item
              </Link>
              <Link to="/wishlist" className="inline-flex h-11 items-center rounded-xl border-2 border-ink bg-white px-4 text-sm font-bold">
                Update my wishlist
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>;
}
