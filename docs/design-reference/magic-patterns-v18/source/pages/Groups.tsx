import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRightIcon, LinkIcon, UsersRoundIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Tape } from '../components/Tape';
import { useAuth } from '../contexts/AuthContext';
import { groupOccasions } from '../data/groupOccasions';
export function Groups() {
  const navigate = useNavigate();
  const {
    isFreshAccount,
    createdGroup
  } = useAuth();
  const [occasion, setOccasion] = useState('');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [inviteError, setInviteError] = useState('');
  if (!isFreshAccount) return <Navigate to="/groups/diwali-scenes" replace />;
  function pickOccasion(label: string, suggested: string) {
    setOccasion(label);
    setName(suggested);
  }
  function create(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (occasion) params.set('occasion', occasion);
    if (name.trim()) params.set('name', name.trim());
    navigate(`/groups/new${params.toString() ? `?${params}` : ''}`);
  }
  function join(e: React.FormEvent) {
    e.preventDefault();
    const value = invite.trim();
    if (!value) return setInviteError('Paste the link your friend sent you.');
    if (!value.includes('/invite/')) return setInviteError('That doesn’t look like a Get Me This invite. It should contain “/invite/”.');
    setInviteError('');
    navigate('/invite/diwali-scenes');
  }
  return <div className="relative mx-auto w-full max-w-6xl px-5 pt-6 sm:px-8 lg:pt-10">
      <Tape className="absolute right-6 top-6 hidden -rotate-6 sm:block" />
      <header>
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {createdGroup ? 'Your groups' : 'Start your first group.'}
        </h1>
        <p className="mt-1 text-lg text-ink-soft">
          {createdGroup ? 'Waiting on friends to join. Share the invite to speed things up.' : 'No groups yet. Pick an occasion to get going, or name it yourself.'}
        </p>
      </header>

      {createdGroup && <section className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border-2 border-ink bg-white p-5 shadow-chunk">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-ink bg-marigold">
              <UsersRoundIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-xl font-extrabold">{createdGroup}</h2>
              <p className="text-sm text-ink-soft">Just you so far · invite pending</p>
            </div>
          </div>
          <button type="button" onClick={() => {
        const slug = createdGroup.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        navigator.clipboard?.writeText(`https://getmethis.app/invite/${slug}`).catch(() => undefined);
        toast('Invite link copied. Drop it in the group chat.');
      }} className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-ink bg-white px-4 text-sm font-bold">
            <LinkIcon className="h-4 w-4" aria-hidden="true" /> Copy invite link
          </button>
        </section>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_1fr] lg:items-start lg:gap-8">
        {/* Create */}
        <form onSubmit={create} aria-labelledby="create-title" className={`rounded-[28px] border-2 border-ink p-6 sm:p-7 ${createdGroup ? 'bg-white' : 'bg-white shadow-chunk'}`}>
          <h2 id="create-title" className="font-display text-2xl font-extrabold leading-tight">
            {createdGroup ? 'Create another group' : 'Create a group'}
          </h2>
          <p className="mt-2 text-[15px] text-ink-soft">For a birthday, Diwali, or anything worth celebrating. Friends see your wishlist once they join.</p>

          <fieldset className="mt-5">
            <legend className="text-sm font-bold text-ink-soft">Pick an occasion</legend>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {groupOccasions.map(o => {
              const active = occasion === o.label;
              return <label key={o.label} className="cursor-pointer">
                    <input type="radio" name="occasion" checked={active} onChange={() => pickOccasion(o.label, o.suggestedName)} className="peer sr-only" />
                    <motion.span whileTap={{
                  scale: 0.94
                }} transition={{
                  duration: 0.12
                }} className={`inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-ink px-4 font-display text-[15px] font-extrabold transition-colors duration-150 peer-focus-visible:ring-4 peer-focus-visible:ring-electric/40 ${active ? 'bg-marigold shadow-chunk-sm' : 'bg-paper hover:bg-cream'}`}>
                      <span className={`h-3 w-3 rounded-full border-2 border-ink ${o.swatch}`} aria-hidden="true" />
                      {o.label}
                    </motion.span>
                  </label>;
            })}
            </div>
          </fieldset>

          <label className="mt-5 block">
            <span className="text-sm font-bold">Group name</span>
            <div className="relative">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rohan turns 27" className="mt-1.5 h-12 w-full rounded-xl border-2 border-ink bg-cream px-3.5 text-base outline-none placeholder:text-ink-mute focus:bg-white focus:shadow-chunk-sm" />
              <AnimatePresence>
                {occasion && <motion.span key={occasion} initial={{
                opacity: 0,
                y: 4,
                scale: 0.96
              }} animate={{
                opacity: 1,
                y: 0,
                scale: 1
              }} exit={{
                opacity: 0
              }} transition={{
                duration: 0.18,
                ease: [0.23, 1, 0.32, 1]
              }} className="pointer-events-none absolute right-2 top-1/2 mt-[3px] -translate-y-1/2 rounded-lg bg-ink px-2 py-1 text-[11px] font-bold text-paper">
                    Suggested
                  </motion.span>}
              </AnimatePresence>
            </div>
          </label>

          <button type="submit" className="mt-5 inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-ink bg-coral px-5 font-bold text-ink shadow-chunk-sm transition-transform duration-150 ease-snap active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
            Create a group <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>

        <div className="flex flex-col gap-6">
          {/* Join */}
          <form onSubmit={join} aria-labelledby="join-title" className="rounded-[28px] border-2 border-ink bg-cream p-6 sm:p-7">
            <h2 id="join-title" className="font-display text-2xl font-extrabold leading-tight">Join a group</h2>
            <p className="mt-2 text-[15px] text-ink-soft">Have an invite link from a friend? Drop it in and you’ll land straight in their group.</p>
            <label htmlFor="invite-link" className="sr-only">Invite link</label>
            <input id="invite-link" type="url" inputMode="url" value={invite} onChange={e => {
            setInvite(e.target.value);
            setInviteError('');
          }} placeholder="Paste invite link…" aria-invalid={!!inviteError} aria-describedby={inviteError ? 'invite-error' : undefined} className={`mt-4 h-12 w-full rounded-xl border-2 bg-white px-3.5 text-base outline-none placeholder:text-ink-mute focus:shadow-chunk-sm ${inviteError ? 'border-coral-deep' : 'border-ink'}`} />
            {inviteError && <p id="invite-error" role="alert" className="mt-2 text-sm font-semibold text-coral-deep">
                {inviteError}
              </p>}
            <button type="submit" className="mt-4 inline-flex h-12 items-center rounded-2xl border-2 border-ink bg-white px-5 font-bold hover:bg-paper">
              Join with a link
            </button>
          </form>

          <p className="rounded-2xl border-2 border-dashed border-ink/35 p-4 text-[15px] text-ink-soft">
            Once friends join, they’ll see your wishlist, and you’ll see theirs.
          </p>
        </div>
      </div>
    </div>;
}
