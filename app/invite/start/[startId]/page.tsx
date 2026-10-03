"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { Button } from "@/src/ui/button";

/**
 * The token-free start page (brief 006c): it contains no invitation
 * content and no analytics. Before it calls the bootstrap endpoint it
 * acquires one origin-wide Web Lock with the fixed product-owned name and
 * holds that lock until the response cookies are applied; the second
 * request presents the now-established coordinator and lease, consumes
 * them, and begins the first flow. Only then does this page navigate to
 * the clean continuation URL.
 *
 * When the browser cannot provide the required origin-wide lock, an
 * accessible unsupported recovery renders and no continuation is created —
 * there is no fallback that races coordinator cookies.
 */

const BOOTSTRAP_LOCK_NAME = "get-me-this:invite-bootstrap";

export default function InviteStartPage() {
  const params = useParams<{ startId: string }>();
  const router = useRouter();
  // Render-time capability check (no effect-state cascade): without the
  // required origin-wide lock the unsupported recovery renders and no
  // continuation is created.
  const unsupported =
    typeof navigator !== "undefined" &&
    (typeof navigator.locks === "undefined" || !params?.startId);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const startId = params?.startId;
    if (!startId || typeof navigator.locks === "undefined") {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      try {
        await navigator.locks.request(BOOTSTRAP_LOCK_NAME, async () => {
          // Phase one (may already be established by a prior start).
          const first = await fetch("/invite/bootstrap", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ startId }),
            credentials: "same-origin",
          });
          if (!first.ok) {
            setFailed(true);
            return;
          }
          const firstBody = (await first.json()) as {
            ok: boolean;
            phase?: string;
          };
          if (!firstBody.ok) {
            setFailed(true);
            return;
          }
          if (firstBody.phase !== "established") {
            // A fresh browser always establishes first; anything else is
            // an unexpected shape and fails safely.
            setFailed(true);
            return;
          }

          // Still holding the lock: phase two consumes the lease and the
          // pending start and begins the flow.
          const second = await fetch("/invite/bootstrap", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ startId }),
            credentials: "same-origin",
          });
          if (!second.ok) {
            setFailed(true);
            return;
          }
          const secondBody = (await second.json()) as {
            ok: boolean;
            phase?: string;
            flowId?: string;
          };
          if (
            !secondBody.ok ||
            secondBody.phase !== "begun" ||
            typeof secondBody.flowId !== "string"
          ) {
            setFailed(true);
            return;
          }
          if (!cancelled) {
            router.replace(`/invite/continue/${secondBody.flowId}`);
          }
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [params?.startId, router]);

  if (unsupported) {
    return (
      <div className="mx-auto w-full max-w-xl px-gutter py-10 sm:py-14">
        <h1 className="font-display text-display-lg leading-[1.02] tracking-tight">
          This browser can&apos;t open the invitation.
        </h1>
        <p className="mt-3 text-lg text-content-secondary">
          Open the invitation link in a current browser, or ask the organizer
          for a new link.
        </p>
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-xl px-gutter py-10 sm:py-14"
      aria-live="polite"
    >
      <h1 className="font-display text-display-lg leading-[1.02] tracking-tight">
        Opening your invitation…
      </h1>
      {failed ? (
        <div className="mt-6">
          <p role="alert" className="text-lg text-content-secondary">
            This invite isn&apos;t available. The link may have expired or been
            replaced — ask the organizer for a new one.
          </p>
          <div className="mt-6">
            <Button variant="secondary" onClick={() => router.push("/")}>
              Back to Get Me This
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
