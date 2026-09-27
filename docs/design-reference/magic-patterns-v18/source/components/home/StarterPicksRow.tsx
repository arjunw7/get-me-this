import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { starterPicks } from '../../data/starterPicks';
export function StarterPicksRow() {
  const navigate = useNavigate();
  const rowRef = useRef<HTMLUListElement>(null);
  function scrollBy(dir: 1 | -1) {
    rowRef.current?.scrollBy({
      left: dir * 220,
      behavior: 'smooth'
    });
  }
  return <div>
      <div className="flex items-center justify-between">
        <p id="starter-label" className="text-sm font-bold text-ink-soft">
          No link handy? Start with an idea
        </p>
        <div className="hidden gap-1 sm:flex">
          <button type="button" onClick={() => scrollBy(-1)} aria-label="Previous ideas" className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink/20 bg-white hover:border-ink">
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => scrollBy(1)} aria-label="More ideas" className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink/20 bg-white hover:border-ink">
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ul ref={rowRef} aria-labelledby="starter-label" className="no-scrollbar -mx-5 mt-3 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2 pt-1 sm:-mx-6 sm:scroll-px-6 sm:px-6">
        {starterPicks.map(pick => <li key={pick.id} className="snap-start">
            <motion.button type="button" whileHover={{
          y: -2
        }} whileTap={{
          scale: 0.97
        }} transition={{
          duration: 0.15,
          ease: [0.23, 1, 0.32, 1]
        }} onClick={() => navigate(`/add?pick=${pick.id}`)} className="flex h-full w-[168px] flex-col gap-2 rounded-2xl border-2 border-ink bg-paper p-3.5 text-left transition-shadow duration-150 hover:shadow-chunk-sm">
              <span className={`h-5 w-5 rounded-md border-2 border-ink ${pick.tone}`} aria-hidden="true" />
              <span className="font-display text-[15px] font-extrabold leading-tight">{pick.label}</span>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-ink-mute">
                Add this <ArrowRightIcon className="h-3 w-3" aria-hidden="true" />
              </span>
            </motion.button>
          </li>)}
      </ul>
    </div>;
}
