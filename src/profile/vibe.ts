/** Persisted profile accents. Values are a closed contract shared with Postgres. */
export const VIBE_OPTIONS = [
  { value: "tomato", label: "Tomato" },
  { value: "marigold", label: "Marigold" },
  { value: "electric", label: "Electric" },
  { value: "acid_lime", label: "Acid lime" },
] as const;
export type Vibe = (typeof VIBE_OPTIONS)[number]["value"];
export const DEFAULT_VIBE: Vibe = "marigold";

/** Strict for writes: invalid values must never silently become a saved default. */
export function parseVibe(value: unknown): Vibe | null {
  return typeof value === "string" &&
    VIBE_OPTIONS.some((option) => option.value === value)
    ? (value as Vibe)
    : null;
}

/** Read-time compatibility for missing values from older profile projections. */
export function normalizeVibe(value: unknown): Vibe {
  return parseVibe(value) ?? DEFAULT_VIBE;
}

const CLASSES: Record<Vibe, string> = {
  tomato: "bg-action-primary text-content-primary",
  marigold: "bg-accent-highlight text-content-primary",
  electric: "bg-accent-info text-surface-raised",
  acid_lime: "bg-accent-fresh text-content-primary",
};
export function vibeClasses(value: unknown): string {
  return CLASSES[normalizeVibe(value)];
}
