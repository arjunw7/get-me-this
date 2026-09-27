import React from 'react';
import type { Desire } from '../../types/wishlist';
import { desireOptions } from '../DesireChip';
interface DesireSelectorProps {
  value: Desire;
  onChange: (d: Desire) => void;
}
const selectedStyle: Record<Desire, string> = {
  really: 'bg-coral',
  love: 'bg-marigold-soft',
  idea: 'bg-white'
};
export function DesireSelector({
  value,
  onChange
}: DesireSelectorProps) {
  return <fieldset>
      <legend className="text-sm font-bold">How much do you want it?</legend>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {desireOptions.map(opt => {
        const active = value === opt.id;
        return <label key={opt.id} className="cursor-pointer">
              <input type="radio" name="desire" value={opt.id} checked={active} onChange={() => onChange(opt.id)} className="peer sr-only" />
              <span className={`flex min-h-[64px] flex-col items-center justify-center rounded-2xl border-2 px-2 py-2 text-center transition-colors duration-150 peer-focus-visible:ring-4 peer-focus-visible:ring-electric/40 ${active ? `border-ink shadow-chunk-sm ${selectedStyle[opt.id]}` : 'border-ink/20 bg-white hover:border-ink'}`}>
                <span className="text-sm font-bold leading-tight">{opt.label}</span>
                <span className="mt-0.5 text-xs text-ink-soft">{opt.hint}</span>
              </span>
            </label>;
      })}
      </div>
    </fieldset>;
}
