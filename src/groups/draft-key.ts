/**
 * Browser-side draft request key and binding (brief 006b, user-scoped
 * idempotency). The key is a cryptographically random UUIDv4 generated with
 * the browser crypto API; before the first server submission it is unbound.
 * When a submission is sent, the key binds to the attempted canonical-payload
 * SHA-256 digest and both values live in session storage. The raw payload and
 * the group name are never stored.
 *
 * If session storage is unavailable, the caller must block submission with a
 * safe recovery error: silently falling back to a reload-volatile key could
 * duplicate an ambiguously committed group.
 */

const DRAFT_KEY_STORAGE = "gmt.groups.create.request-key";
const DRAFT_BINDING_STORAGE = "gmt.groups.create.binding";

export type DraftKeyOutcome =
  { ok: true; key: string } | { ok: false; reason: "unavailable" | "invalid" };

export type DraftBinding = { readonly digest: string };

function sessionStorageOrNull(): Storage | null {
  try {
    const storage = window.sessionStorage;
    const probe = "gmt.groups.create.probe";
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * The draft's request key: loaded from session storage when present (the
 * same-tab reload keeps the attempted binding), otherwise freshly created.
 */
export function loadOrCreateDraftKey(): DraftKeyOutcome {
  const storage = sessionStorageOrNull();
  if (!storage) return { ok: false, reason: "unavailable" };
  try {
    const existing = storage.getItem(DRAFT_KEY_STORAGE);
    if (existing !== null) {
      return UUID_V4_PATTERN.test(existing)
        ? { ok: true, key: existing }
        : { ok: false, reason: "invalid" };
    }
    const key = crypto.randomUUID();
    storage.setItem(DRAFT_KEY_STORAGE, key);
    return { ok: true, key };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** The attempted payload digest binding, or null before the first submission. */
export function loadDraftBinding(): DraftBinding | null {
  const storage = sessionStorageOrNull();
  if (!storage) return null;
  try {
    const raw = storage.getItem(DRAFT_BINDING_STORAGE);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { digest?: unknown }).digest === "string"
    ) {
      return { digest: (parsed as { digest: string }).digest };
    }
    return null;
  } catch {
    return null;
  }
}

/** Binds the current draft key to the attempted canonical payload digest. */
export function bindDraftToDigest(key: string, digest: string): boolean {
  const storage = sessionStorageOrNull();
  if (!storage) return false;
  try {
    storage.setItem(DRAFT_KEY_STORAGE, key);
    storage.setItem(
      DRAFT_BINDING_STORAGE,
      JSON.stringify({ digest } satisfies DraftBinding),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * The only paths that deliberately replace the key: the explicit
 * "Submit changes as a new request" confirmation before success, and
 * "Start another group" after success (a fresh form gets a fresh key).
 */
export function rotateDraftKey(): DraftKeyOutcome {
  const storage = sessionStorageOrNull();
  if (!storage) return { ok: false, reason: "unavailable" };
  try {
    const key = crypto.randomUUID();
    storage.setItem(DRAFT_KEY_STORAGE, key);
    // The replacement request starts unbound; the next submit binds the
    // changed digest to the new key.
    storage.removeItem(DRAFT_BINDING_STORAGE);
    return { ok: true, key };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/** Success clears the submitted key/digest pair. */
export function clearDraft(): void {
  const storage = sessionStorageOrNull();
  if (!storage) return;
  try {
    storage.removeItem(DRAFT_KEY_STORAGE);
    storage.removeItem(DRAFT_BINDING_STORAGE);
  } catch {
    // A cleared-already or blocked storage leaves nothing to do; a fresh
    // draft key is created on the next form mount.
  }
}
