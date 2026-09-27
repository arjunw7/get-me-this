import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useCircle } from '../../contexts/CircleContext';
import { giftingModes } from '../../data/circle';
import type { GiftingMode } from '../../types/wishlist';
import { Sheet } from '../Sheet';
interface ModeSheetProps {
  open: boolean;
  onClose: () => void;
}
export function ModeSheet({
  open,
  onClose
}: ModeSheetProps) {
  const {
    mode,
    setMode
  } = useCircle();
  const [choice, setChoice] = useState<GiftingMode>(mode);
  useEffect(() => {
    if (open) setChoice(mode);
  }, [open, mode]);
  function save() {
    if (choice !== mode) {
      setMode(choice);
      const name = giftingModes.find(m => m.id === choice)?.name;
      toast(`Switched to ${name}. Everyone’s been told.`);
    }
    onClose();
  }
  return <Sheet open={open} onClose={onClose} title="Gifting mode" description="Existing reservations stay put, and stay secret.">
      <fieldset className="flex flex-col gap-2.5">
        <legend className="sr-only">Choose a gifting mode</legend>
        {giftingModes.map(m => {
        const active = choice === m.id;
        return <label key={m.id} className={`flex cursor-pointer gap-3 rounded-2xl border-2 p-4 transition-colors duration-150 ${active ? 'border-ink bg-marigold-soft shadow-chunk-sm' : 'border-ink/20 bg-white hover:border-ink'}`}>
              <input type="radio" name="mode" value={m.id} checked={active} onChange={() => setChoice(m.id)} className="mt-1 h-5 w-5 shrink-0 accent-[#17140F]" />
              <span>
                <span className="block font-display text-lg font-bold">{m.name}</span>
                <span className="mt-0.5 block text-sm text-ink-soft">{m.description}</span>
              </span>
            </label>;
      })}
      </fieldset>
      <button type="button" onClick={save} className="mt-5 h-12 w-full rounded-2xl border-2 border-ink bg-ink font-bold text-paper transition-transform duration-150 ease-snap active:scale-[0.98]">
        Save mode
      </button>
    </Sheet>;
}
