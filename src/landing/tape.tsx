/**
 * Decorative tape strip, ported from the frozen V18 reference
 * (components/Tape.tsx). Colour and hairline are tokens; only the
 * torn-edge clip-path shape is literal geometry.
 */
export function Tape({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none block h-6 w-20 bg-surface-tape/90 shadow-tape ${className}`}
      style={{
        clipPath:
          "polygon(0 8%, 6% 0, 12% 10%, 20% 2%, 30% 8%, 40% 0, 52% 8%, 62% 2%, 74% 10%, 86% 0, 94% 8%, 100% 2%, 100% 92%, 94% 100%, 86% 90%, 74% 98%, 62% 90%, 52% 100%, 40% 92%, 30% 100%, 20% 90%, 12% 98%, 6% 90%, 0 100%)",
      }}
    />
  );
}
