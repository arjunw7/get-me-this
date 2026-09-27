import React from 'react';
import { Link } from 'react-router-dom';
import { LinkIcon } from 'lucide-react';
import { Tape } from '../Tape';
export function ShelfieEmpty() {
  return <section className="flex flex-col items-center rounded-[32px] border-2 border-dashed border-ink/35 bg-white px-6 py-14 text-center">
      <div className="relative h-36 w-56" aria-hidden="true">
        <div className="absolute left-2 top-4 h-28 w-24 -rotate-6 rounded-2xl border-2 border-dashed border-ink/30 bg-cream" />
        <div className="absolute right-2 top-2 h-28 w-24 rotate-6 rounded-2xl border-2 border-dashed border-ink/30 bg-cream" />
        <div className="absolute left-1/2 top-0 h-32 w-28 -translate-x-1/2 rounded-2xl border-2 border-ink bg-white shadow-chunk">
          <Tape className="absolute -top-3 left-1/2 w-14 -translate-x-1/2 rotate-2" />
          <span className="absolute inset-0 flex items-center justify-center font-display text-4xl font-extrabold text-ink/20">?</span>
        </div>
      </div>
      <h2 className="mt-8 font-display text-3xl font-extrabold tracking-tight">Very minimalist of you.</h2>
      <p className="mt-2 max-w-md text-ink-soft">
        Add the first thing you’d secretly love to unwrap. A candle, a camera, the hoodie you keep looking at. Your
        friends will take it from there.
      </p>
      <Link to="/add" className="mt-6 inline-flex h-12 items-center gap-2 rounded-2xl border-2 border-ink bg-coral px-6 font-bold text-ink shadow-chunk transition-transform duration-150 ease-snap hover:-translate-y-0.5">
        <LinkIcon className="h-4 w-4" aria-hidden="true" />
        Add from a link
      </Link>
    </section>;
}
