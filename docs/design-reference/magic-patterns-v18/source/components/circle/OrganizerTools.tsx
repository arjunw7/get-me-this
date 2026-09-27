import React, { useState } from 'react';
import { BellRingIcon, LockIcon, Repeat2Icon, UnlockIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useCircle } from '../../contexts/CircleContext';
import { giftingModes } from '../../data/circle';
import { members } from '../../data/members';
import { ModeSheet } from './ModeSheet';
export function OrganizerTools() {
  const {
    mode
  } = useCircle();
  const [modeOpen, setModeOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const pending = members.filter(m => m.status === 'pending');
  const modeName = giftingModes.find(m => m.id === mode)?.name;
  const btn = 'flex min-h-[64px] items-center gap-3 rounded-2xl border-2 border-ink/15 bg-white px-4 py-3 text-left transition-colors duration-150 hover:border-ink';
  return <div className="grid gap-2.5 sm:grid-cols-3">
      <button type="button" className={btn} onClick={() => setModeOpen(true)}>
        <Repeat2Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>
          <span className="block font-bold">Change gifting mode</span>
          <span className="block text-sm text-ink-soft">Now: {modeName}</span>
        </span>
      </button>
      <button type="button" className={btn} disabled={pending.length === 0} onClick={() => toast(`Nudged ${pending.map(p => p.firstName).join(' and ')}. Gently.`)}>
        <BellRingIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span>
          <span className="block font-bold">Nudge {pending.length} pending</span>
          <span className="block text-sm text-ink-soft">{pending.map(p => p.firstName).join(', ')}</span>
        </span>
      </button>
      <button type="button" className={btn} aria-pressed={locked} onClick={() => {
      setLocked(l => !l);
      toast(locked ? 'Invites reopened' : 'Invites locked. No plus-ones.');
    }}>
        {locked ? <LockIcon className="h-5 w-5 shrink-0" aria-hidden="true" /> : <UnlockIcon className="h-5 w-5 shrink-0" aria-hidden="true" />}
        <span>
          <span className="block font-bold">{locked ? 'Unlock invites' : 'Lock invites'}</span>
          <span className="block text-sm text-ink-soft">{locked ? 'Nobody new can join' : 'Anyone with the link can join'}</span>
        </span>
      </button>
      <ModeSheet open={modeOpen} onClose={() => setModeOpen(false)} />
    </div>;
}
