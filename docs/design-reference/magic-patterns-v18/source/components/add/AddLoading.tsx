import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckIcon, Loader2Icon } from 'lucide-react';
const STEPS = ['Peeking at the page', 'Grabbing the good photos', 'Doing the currency maths'];
interface AddLoadingProps {
  host: string;
  onCancel: () => void;
}
export function AddLoading({
  host,
  onCancel
}: AddLoadingProps) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t1 = window.setTimeout(() => setStep(1), 650);
    const t2 = window.setTimeout(() => setStep(2), 1300);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);
  return <div role="status" aria-live="polite" className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl font-extrabold leading-[1.02] tracking-tight">Being nosy…</h1>
        <p className="mt-2 truncate text-ink-soft">Reading {host}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return <motion.li key={label} initial={{
          opacity: 0,
          y: 6
        }} animate={{
          opacity: i <= step ? 1 : 0.4,
          y: 0
        }} transition={{
          duration: 0.2,
          delay: i * 0.05
        }} className="flex items-center gap-3 text-lg font-semibold">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink ${done ? 'bg-ink text-paper' : 'bg-white'}`}>
                {done ? <CheckIcon className="h-4 w-4" strokeWidth={3} /> : active ? <Loader2Icon className="h-4 w-4 animate-spin" /> : null}
              </span>
              {label}
            </motion.li>;
      })}
      </ol>
      <div className="flex gap-4 rounded-[24px] border-2 border-ink/15 bg-white p-4" aria-hidden="true">
        <div className="h-28 w-24 shrink-0 animate-pulse rounded-2xl bg-cream" />
        <div className="flex flex-1 flex-col gap-2.5 pt-1">
          <div className="h-4 w-4/5 animate-pulse rounded-full bg-cream" />
          <div className="h-4 w-1/2 animate-pulse rounded-full bg-cream" />
          <div className="mt-auto h-4 w-1/3 animate-pulse rounded-full bg-cream" />
        </div>
      </div>
      <button type="button" onClick={onCancel} className="h-12 self-start rounded-xl px-2 font-bold underline-offset-4 hover:underline">
        Cancel
      </button>
    </div>;
}
