import React, { useRef } from 'react';
interface OtpInputProps {
  digits: string[];
  onChange: (digits: string[]) => void;
  invalid?: boolean;
  disabled?: boolean;
  labelledBy: string;
  describedBy?: string;
}
export function OtpInput({
  digits,
  onChange,
  invalid = false,
  disabled = false,
  labelledBy,
  describedBy
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  function fillFrom(start: number, chars: string) {
    const next = [...digits];
    let last = start;
    chars.slice(0, 6 - start).split('').forEach((ch, k) => {
      next[start + k] = ch;
      last = start + k;
    });
    onChange(next);
    refs.current[Math.min(last + 1, 5)]?.focus();
  }
  function handleChange(i: number, raw: string) {
    const v = raw.replace(/\D/g, '');
    if (!v) {
      const next = [...digits];
      next[i] = '';
      onChange(next);
      return;
    }
    fillFrom(i, v.length > 1 ? v : v);
  }
  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      const next = [...digits];
      next[i - 1] = '';
      onChange(next);
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < 5) {
      refs.current[i + 1]?.focus();
    }
  }
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!text) return;
    e.preventDefault();
    fillFrom(0, text);
  }
  return <div role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="flex justify-between gap-2 sm:gap-3">
      {digits.map((d, i) => <input key={i} ref={el => {
      refs.current[i] = el;
    }} value={d} disabled={disabled} onChange={e => handleChange(i, e.target.value)} onKeyDown={e => handleKeyDown(i, e)} onPaste={handlePaste} onFocus={e => e.target.select()} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} aria-label={`Digit ${i + 1} of 6`} aria-invalid={invalid} className={`h-14 w-full min-w-0 max-w-[56px] rounded-2xl border-2 text-center font-display text-2xl font-extrabold tabular-nums outline-none transition-colors duration-150 focus:shadow-chunk-sm disabled:opacity-60 sm:h-16 ${invalid ? 'border-coral-deep bg-coral-soft' : d ? 'border-ink bg-white' : 'border-ink/40 bg-white'}`} />)}
    </div>;
}
