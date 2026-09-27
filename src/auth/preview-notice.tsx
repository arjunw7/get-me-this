import { previewNotice } from "./copy";

/**
 * The honest static-preview notice, shown on every frame where a
 * confirmation, verification, or sign-in state could otherwise imply a
 * real backend action. `role="status"` announces it politely alongside the
 * state it qualifies. Copy lives in src/auth/copy.ts (single source).
 */
export function PreviewNotice({ id }: { id: string }) {
  return (
    <p
      id={id}
      role="status"
      className="rounded-surface bg-accent-highlight-soft px-4 py-3 text-center text-sm font-semibold"
    >
      {previewNotice}
    </p>
  );
}
