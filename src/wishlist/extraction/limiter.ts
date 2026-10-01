export type AdmissionFailure = "rate" | "concurrency";

export type AdmissionPermit = {
  readonly release: () => void;
};

export type AdmissionResult =
  | { readonly ok: true; readonly permit: AdmissionPermit }
  | { readonly ok: false; readonly reason: AdmissionFailure };

type LimiterOptions = {
  readonly windowMs?: number;
  readonly userRate?: number;
  readonly processRate?: number;
  readonly userConcurrency?: number;
  readonly processConcurrency?: number;
};

/**
 * Single-process rolling admission control. This first deployment is
 * intentionally per Node instance. A multi-instance deployment must add a
 * shared limiter before increasing aggregate capacity.
 */
export class ExtractionLimiter {
  private readonly windowMs: number;
  private readonly userRate: number;
  private readonly processRate: number;
  private readonly userConcurrency: number;
  private readonly processConcurrency: number;
  private readonly userAttempts = new Map<string, number[]>();
  private processAttempts: number[] = [];
  private readonly activeUsers = new Map<string, number>();
  private activeProcess = 0;

  constructor(options: LimiterOptions = {}) {
    this.windowMs = options.windowMs ?? 60_000;
    this.userRate = options.userRate ?? 5;
    this.processRate = options.processRate ?? 60;
    this.userConcurrency = options.userConcurrency ?? 2;
    this.processConcurrency = options.processConcurrency ?? 16;
  }

  acquire(userId: string, now = Date.now()): AdmissionResult {
    const cutoff = now - this.windowMs;
    this.processAttempts = this.processAttempts.filter((time) => time > cutoff);
    for (const [id, attempts] of this.userAttempts) {
      const fresh = attempts.filter((time) => time > cutoff);
      if (fresh.length === 0) this.userAttempts.delete(id);
      else this.userAttempts.set(id, fresh);
    }
    const userAttempts = this.userAttempts.get(userId) ?? [];
    if (
      userAttempts.length >= this.userRate ||
      this.processAttempts.length >= this.processRate
    ) {
      return { ok: false, reason: "rate" };
    }
    if (
      (this.activeUsers.get(userId) ?? 0) >= this.userConcurrency ||
      this.activeProcess >= this.processConcurrency
    ) {
      return { ok: false, reason: "concurrency" };
    }

    userAttempts.push(now);
    this.userAttempts.set(userId, userAttempts);
    this.processAttempts.push(now);
    this.activeUsers.set(userId, (this.activeUsers.get(userId) ?? 0) + 1);
    this.activeProcess += 1;
    let released = false;
    return {
      ok: true,
      permit: {
        release: () => {
          if (released) return;
          released = true;
          this.activeProcess -= 1;
          const remaining = (this.activeUsers.get(userId) ?? 1) - 1;
          if (remaining === 0) this.activeUsers.delete(userId);
          else this.activeUsers.set(userId, remaining);
        },
      },
    };
  }
}

export const extractionLimiter = new ExtractionLimiter();
