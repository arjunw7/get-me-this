/**
 * Product wordmark, ported from the frozen V18 reference
 * (components/Wordmark.tsx) with token-mapped classes.
 */
export function Wordmark({ className = "text-2xl" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-baseline font-display font-extrabold leading-none whitespace-nowrap tracking-tight ${className}`}
    >
      Get Me
      {/* Offsets below are proportional (em) geometry from the reference,
          not pixel constants: they scale with the wordmark size. */}
      <span className="relative ml-[0.22em]">
        This
        <svg
          aria-hidden="true"
          viewBox="0 0 100 12"
          preserveAspectRatio="none"
          className="absolute -bottom-[0.22em] left-0 h-[0.28em] w-full text-action-primary"
        >
          <path
            d="M2 8 C 18 2, 30 12, 48 6 S 80 2, 98 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </span>
  );
}
