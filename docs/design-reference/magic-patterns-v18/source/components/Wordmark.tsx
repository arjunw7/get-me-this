import React from 'react';
interface WordmarkProps {
  className?: string;
}
export function Wordmark({
  className = 'text-2xl'
}: WordmarkProps) {
  return <span className={`inline-flex items-baseline whitespace-nowrap font-display font-extrabold leading-none tracking-tight ${className}`}>
      Get Me
      <span className="relative ml-[0.22em]">
        This
        <svg aria-hidden="true" viewBox="0 0 100 12" preserveAspectRatio="none" className="absolute -bottom-[0.22em] left-0 h-[0.28em] w-full text-coral">
          <path d="M2 8 C 18 2, 30 12, 48 6 S 80 2, 98 7" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </span>
    </span>;
}
