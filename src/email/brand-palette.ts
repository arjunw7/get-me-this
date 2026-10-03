import "server-only";

/**
 * The email-rendering palette (009a): the semantic design tokens from
 * app/tokens.css expressed as raw values.
 *
 * Scoped, documented exception to the design-token rule: transactional
 * email HTML renders in external clients (Gmail, Outlook) where Tailwind
 * CSS variables and app stylesheets are unavailable, so the branded
 * templates inline these values. This module is the single source of those
 * values for src/email — no other production file outside app/tokens.css
 * and this module may carry a raw colour.
 */

export const EMAIL_PALETTE = {
  /** --color-surface-page */
  pageBackground: "#fbf6ee",
  /** --color-content-primary */
  contentPrimary: "#17140f",
  /** --color-content-muted */
  contentMuted: "#6b6358",
  /** --color-action-primary */
  actionPrimary: "#ff5a36",
  /** --color-action-primary-content (raised action surfaces use white text) */
  actionPrimaryContent: "#ffffff",
} as const;
