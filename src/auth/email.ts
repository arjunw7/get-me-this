/**
 * Email validation shared by the client entry form, the server action, and
 * the carry-cookie read path (004c), so all three enforce one rule and the
 * server can never be talked past the client's check.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when the value is a syntactically plausible email after trimming. */
export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}
