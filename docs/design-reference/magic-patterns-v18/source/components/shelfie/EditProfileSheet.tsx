import React, { useEffect, useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useShelfie } from '../../contexts/ShelfieContext';
import type { AccentColor } from '../../types/wishlist';
import { accentFill, accentLabels } from '../../utils/accent';
import { Sheet } from '../Sheet';
const THEMES: AccentColor[] = ['coral', 'marigold', 'electric', 'lime'];
interface EditProfileSheetProps {
  open: boolean;
  onClose: () => void;
}
export function EditProfileSheet({
  open,
  onClose
}: EditProfileSheetProps) {
  const {
    profile,
    setProfile,
    theme,
    setTheme
  } = useShelfie();
  const [name, setName] = useState(profile.name);
  const [line, setLine] = useState(profile.line);
  const [color, setColor] = useState<AccentColor>(theme);
  useEffect(() => {
    if (open) {
      setName(profile.name);
      setLine(profile.line);
      setColor(theme);
    }
  }, [open, profile, theme]);
  const nameError = name.trim().length === 0;
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (nameError) return;
    setProfile({
      name: name.trim(),
      line: line.trim()
    });
    setTheme(color);
    toast('Wishlist updated');
    onClose();
  }
  return <Sheet open={open} onClose={onClose} title="Edit your wishlist" description="Only people in your groups see this.">
      <form onSubmit={save} className="flex flex-col gap-5">
        <label className="block">
          <span className="text-sm font-bold">Name</span>
          <input value={name} onChange={e => setName(e.target.value)} aria-invalid={nameError} className="mt-1.5 h-12 w-full rounded-xl border-2 border-ink bg-white px-3.5 text-base outline-none focus:shadow-chunk-sm" />
          {nameError && <span className="mt-1 block text-sm font-semibold text-coral-deep">Your friends need something to call you.</span>}
        </label>
        <label className="block">
          <span className="text-sm font-bold">Personality line</span>
          <input value={line} maxLength={60} onChange={e => setLine(e.target.value)} placeholder="currently in my tiny-luxuries era" className="mt-1.5 h-12 w-full rounded-xl border-2 border-ink bg-white px-3.5 text-base outline-none focus:shadow-chunk-sm" />
          <span className="mt-1 block text-right text-xs text-ink-mute">{line.length}/60</span>
        </label>
        <fieldset>
          <legend className="text-sm font-bold">Theme colour</legend>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {THEMES.map(t => <label key={t} className="cursor-pointer">
                <input type="radio" name="theme" value={t} checked={color === t} onChange={() => setColor(t)} className="peer sr-only" />
                <span className={`flex h-14 items-center justify-center rounded-2xl border-2 border-ink peer-focus-visible:ring-4 peer-focus-visible:ring-electric/40 ${accentFill[t]} ${color === t ? 'shadow-chunk-sm' : ''}`}>
                  {color === t && <CheckIcon className="h-5 w-5" strokeWidth={3} aria-hidden="true" />}
                </span>
                <span className="mt-1 block text-center text-xs font-semibold">{accentLabels[t]}</span>
              </label>)}
          </div>
        </fieldset>
        <button type="submit" className="h-12 rounded-2xl border-2 border-ink bg-ink font-bold text-paper transition-transform duration-150 ease-snap active:scale-[0.98]">
          Save changes
        </button>
      </form>
    </Sheet>;
}
