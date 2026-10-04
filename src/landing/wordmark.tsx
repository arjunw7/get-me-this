/**
 * Product wordmark, ported from the frozen V18 reference
 * (components/Wordmark.tsx) with token-mapped classes.
 */
export function Wordmark({
  className = "text-2xl",
  imageColors,
}: {
  className?: string;
  /** Inline styles keep the server-rendered share logo identical to the app. */
  imageColors?: { ink: string; accent: string };
}) {
  return (
    <span
      className={`inline-flex items-baseline font-display font-extrabold leading-none whitespace-nowrap tracking-tight ${className}`}
      style={
        imageColors
          ? {
              display: "flex",
              alignItems: "baseline",
              fontFamily: "Bricolage Grotesque",
              fontWeight: 800,
              fontSize: 42,
              lineHeight: 1,
              letterSpacing: -1.5,
              color: imageColors.ink,
            }
          : undefined
      }
    >
      Get Me
      {/* Offsets below are proportional (em) geometry from the reference,
          not pixel constants: they scale with the wordmark size. */}
      <span
        className="relative ml-[0.22em]"
        style={
          imageColors
            ? { display: "flex", position: "relative", marginLeft: "0.22em" }
            : undefined
        }
      >
        This
        <svg
          aria-hidden="true"
          viewBox="0 0 100 12"
          preserveAspectRatio="none"
          className="absolute -bottom-[0.22em] left-0 h-[0.28em] w-full text-action-primary"
          style={
            imageColors
              ? {
                  position: "absolute",
                  bottom: "-0.22em",
                  left: 0,
                  height: "0.28em",
                  width: "100%",
                  color: imageColors.accent,
                }
              : undefined
          }
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
