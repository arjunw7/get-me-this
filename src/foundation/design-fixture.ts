import type {
  ButtonSize,
  ButtonVariant,
  SurfaceElevation,
  SurfaceTone,
} from "@/src/ui";

/**
 * Static content for the design foundation fixture route.
 *
 * Everything here is fixed: no dates, randomness, network images, or product
 * data. The fixture exists to show supported token and primitive states.
 */

export const designFixture = {
  eyebrow: "Design foundation",
  title: "Tokens and primitives",
  description:
    "Semantic tokens, accessible primitives, and responsive foundations derived from the approved Get Me This reference.",
} as const;

export type TypeSample = {
  readonly id: string;
  readonly token: string;
  readonly className: string;
  readonly sample: string;
};

export const typeSamples: readonly TypeSample[] = [
  {
    id: "display-lg",
    token: "--text-display-lg",
    className: "font-display text-display-lg",
    sample: "Make a wishlist",
  },
  {
    id: "display-md",
    token: "--text-display-md",
    className: "font-display text-display-md",
    sample: "Share it with your people",
  },
  {
    id: "display-sm",
    token: "--text-display-sm",
    className: "font-display text-display-sm",
    sample: "Group wishlists for every occasion",
  },
  {
    id: "heading",
    token: "--text-heading",
    className: "font-display text-heading",
    sample: "Section heading",
  },
  {
    id: "body",
    token: "--text-body",
    className: "text-body",
    sample: "Body copy stays highly readable at every width.",
  },
  {
    id: "label",
    token: "--text-label",
    className: "font-display text-label",
    sample: "Field label",
  },
  {
    id: "caption",
    token: "--text-caption",
    className: "text-caption text-content-secondary",
    sample: "Supporting caption",
  },
];

export type ColorSwatch = {
  readonly id: string;
  readonly token: string;
  readonly className: string;
};

export const colorSwatches: readonly ColorSwatch[] = [
  {
    id: "surface-page",
    token: "--color-surface-page",
    className: "bg-surface-page",
  },
  {
    id: "surface-raised",
    token: "--color-surface-raised",
    className: "bg-surface-raised",
  },
  {
    id: "surface-sunken",
    token: "--color-surface-sunken",
    className: "bg-surface-sunken",
  },
  {
    id: "action-primary",
    token: "--color-action-primary",
    className: "bg-action-primary",
  },
  {
    id: "action-primary-strong",
    token: "--color-action-primary-strong",
    className: "bg-action-primary-strong",
  },
  {
    id: "accent-highlight",
    token: "--color-accent-highlight",
    className: "bg-accent-highlight",
  },
  {
    id: "accent-info",
    token: "--color-accent-info",
    className: "bg-accent-info",
  },
  {
    id: "accent-fresh",
    token: "--color-accent-fresh",
    className: "bg-accent-fresh",
  },
  {
    id: "feedback-error",
    token: "--color-feedback-error",
    className: "bg-feedback-error",
  },
  {
    id: "outline-subtle",
    token: "--color-outline-subtle",
    className: "bg-outline-subtle",
  },
];

export type ButtonSample = {
  readonly id: string;
  readonly label: string;
  readonly variant: ButtonVariant;
  readonly size: ButtonSize;
  readonly disabled: boolean;
};

export const buttonSamples: readonly ButtonSample[] = [
  {
    id: "primary-lg",
    label: "Start my wishlist",
    variant: "primary",
    size: "lg",
    disabled: false,
  },
  {
    id: "primary-md",
    label: "Add an item",
    variant: "primary",
    size: "md",
    disabled: false,
  },
  {
    id: "secondary-md",
    label: "Create a group",
    variant: "secondary",
    size: "md",
    disabled: false,
  },
  {
    id: "subtle-md",
    label: "Update my wishlist",
    variant: "subtle",
    size: "md",
    disabled: false,
  },
  {
    id: "primary-disabled",
    label: "Primary disabled",
    variant: "primary",
    size: "md",
    disabled: true,
  },
  {
    id: "subtle-disabled",
    label: "Subtle disabled",
    variant: "subtle",
    size: "md",
    disabled: true,
  },
];

export type SurfaceSample = {
  readonly id: string;
  readonly heading: string;
  readonly tone: SurfaceTone;
  readonly elevation: SurfaceElevation;
};

export const surfaceSamples: readonly SurfaceSample[] = [
  { id: "raised-md", heading: "Raised", tone: "raised", elevation: "md" },
  { id: "sunken-sm", heading: "Sunken", tone: "sunken", elevation: "sm" },
  { id: "accent-lg", heading: "Accent", tone: "accent", elevation: "lg" },
];

export const motionNotes: readonly string[] = [
  "Presses use the snap easing token and the press duration token.",
  "Hover lift and press offset are gated on :enabled, so disabled controls never move.",
  "Every transition collapses to 0.01ms under prefers-reduced-motion: reduce.",
];
