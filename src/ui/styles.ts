/**
 * Pure class maps for the interface primitives.
 *
 * Keeping composition in plain functions makes every variant and state
 * assertable without a DOM, and keeps token usage in one reviewable place.
 * Every class here must resolve to a token declared in app/tokens.css.
 */

export type ButtonVariant = "primary" | "secondary" | "subtle" | "contrast";
export type ButtonSize = "md" | "lg";
export type SurfaceTone = "raised" | "sunken" | "accent";
export type SurfaceElevation = "none" | "sm" | "md" | "lg";
export type SurfacePadding = "none" | "comfortable";

const OUTLINE_WIDTH = "border-[length:var(--border-strong)]";
const OUTLINE = cx(OUTLINE_WIDTH, "border-outline-strong");
const PRESS_MOTION =
  "transition-[transform,box-shadow] duration-[var(--duration-press)] ease-snap";

export function cx(...classNames: ReadonlyArray<string | false | undefined>) {
  return classNames.filter((value) => Boolean(value)).join(" ");
}

const BUTTON_BASE = cx(
  "inline-flex items-center justify-center gap-2",
  "font-display font-bold",
  "rounded-surface min-h-touch-min",
  OUTLINE,
  PRESS_MOTION,
  // Motion is gated on :enabled so a disabled control never moves on hover.
  "enabled:hover:-translate-y-0.5",
  "enabled:active:translate-x-0.5 enabled:active:translate-y-0.5 enabled:active:shadow-none",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-content-muted disabled:shadow-none",
);

// Text colour lives per variant: two colour utilities for the same property
// would otherwise resolve by stylesheet order rather than by variant.
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-action-primary text-content-primary shadow-chunk",
  secondary: "bg-accent-highlight text-content-primary shadow-chunk-sm",
  subtle: "bg-surface-raised text-content-primary shadow-chunk-sm",
  contrast: "bg-outline-strong text-surface-page shadow-chunk",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  md: "h-control-md px-5 text-label",
  lg: "h-control-lg px-6 text-heading",
};

export function buttonClassName(options: {
  variant: ButtonVariant;
  size: ButtonSize;
}) {
  return cx(
    BUTTON_BASE,
    BUTTON_VARIANTS[options.variant],
    BUTTON_SIZES[options.size],
  );
}

const CONTROL_BASE = cx(
  "block w-full rounded-control px-3.5",
  "font-body text-body text-content-primary placeholder:text-content-muted",
  OUTLINE_WIDTH,
  // No outline-none here: the control must keep the global :focus-visible ring.
  "transition-[box-shadow] duration-[var(--duration-press)] ease-snap",
  "focus:shadow-chunk-sm",
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-content-muted",
);

// Valid and invalid tones are mutually exclusive: two utilities for the same
// property would otherwise resolve by stylesheet order rather than by state.
const CONTROL_TONES = {
  valid: "border-outline-strong bg-surface-raised",
  invalid: "border-feedback-error bg-feedback-error-soft",
} as const;

export function controlClassName(options: {
  invalid: boolean;
  multiline: boolean;
}) {
  return cx(
    CONTROL_BASE,
    options.multiline ? "min-h-32 resize-y py-3" : "h-control-md",
    options.invalid ? CONTROL_TONES.invalid : CONTROL_TONES.valid,
  );
}

export const fieldLabelClassName =
  "font-display text-label text-content-primary";

export const fieldHintClassName = "text-caption text-content-secondary";

export const fieldErrorClassName = "text-caption font-bold text-feedback-error";

export function textLinkClassName() {
  return cx(
    "font-semibold text-content-primary underline decoration-2 underline-offset-4",
    "rounded-control transition-colors duration-[var(--duration-press)] ease-snap",
    "hover:text-action-primary-strong",
  );
}

const SURFACE_TONES: Record<SurfaceTone, string> = {
  raised: "bg-surface-raised",
  sunken: "bg-surface-sunken",
  accent: "bg-action-primary-soft",
};

const SURFACE_ELEVATIONS: Record<SurfaceElevation, string> = {
  none: "shadow-none",
  sm: "shadow-chunk-sm",
  md: "shadow-chunk",
  lg: "shadow-chunk-lg",
};

const SURFACE_PADDINGS: Record<SurfacePadding, string> = {
  none: "",
  comfortable: "p-gutter lg:p-gutter-lg",
};

export function surfaceClassName(options: {
  tone: SurfaceTone;
  elevation: SurfaceElevation;
  padding: SurfacePadding;
}) {
  return cx(
    "rounded-surface-lg",
    OUTLINE,
    SURFACE_TONES[options.tone],
    SURFACE_ELEVATIONS[options.elevation],
    SURFACE_PADDINGS[options.padding],
  );
}
