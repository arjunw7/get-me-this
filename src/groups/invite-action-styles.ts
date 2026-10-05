/** Matching shapes and interactions for the invite and group-opening actions. */
export function inviteActionClassName(tone: "dark" | "light" = "dark") {
  return `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-control border-2 border-outline-strong px-4 text-sm font-bold transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong ${tone === "dark" ? "bg-content-primary text-surface-raised" : "bg-surface-raised text-content-primary"}`;
}
