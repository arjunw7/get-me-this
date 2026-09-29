import { isBlank } from "./blank";

/**
 * The profile-completeness gate (004e), evaluated server-side only.
 *
 * A profile is complete when its display name is non-null AND non-blank
 * under the one shared whitespace rule — never a null-only check. The
 * database CHECK constraint is the primary control (a blank display_name
 * cannot be written through any path, including direct authenticated
 * updates); this gate is defense in depth for rows that predate the
 * migration or values written through any future path. A test seeds the
 * blank corpus through a privileged fixture and asserts every entry reads
 * as incomplete.
 */
export function isProfileComplete(displayName: string | null): boolean {
  return displayName !== null && !isBlank(displayName);
}
