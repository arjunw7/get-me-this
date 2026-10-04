"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/src/ui/button";
import { ANALYTICS_CONSENT_CHANGED } from "./consent";
import {
  applyAnalyticsConsent,
  getAnalyticsConsent,
  isClientAnalyticsConfigured,
  setAnalyticsConsent,
} from "./client";

function subscribe(onChange: () => void) {
  const sync = () => onChange();
  const crossTab = () => {
    applyAnalyticsConsent();
    onChange();
  };
  window.addEventListener(ANALYTICS_CONSENT_CHANGED, sync);
  window.addEventListener("storage", crossTab);
  window.addEventListener("focus", crossTab);
  return () => {
    window.removeEventListener(ANALYTICS_CONSENT_CHANGED, sync);
    window.removeEventListener("storage", crossTab);
    window.removeEventListener("focus", crossTab);
  };
}

/** The banner disappears after a choice; footer preferences remain available. */
export function AnalyticsConsentControl({
  placement = "banner",
}: {
  placement?: "banner" | "footer";
}) {
  const choice = useSyncExternalStore(
    subscribe,
    getAnalyticsConsent,
    () => undefined,
  );
  const [open, setOpen] = useState(false);
  if (choice === undefined || !isClientAnalyticsConfigured()) return null;
  if (placement === "footer" && choice === "pending") return null;
  if (choice !== "pending" && !open) {
    return placement === "footer" ? (
      <button
        type="button"
        className="ph-no-capture inline-flex min-h-11 cursor-pointer items-center text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        onClick={() => setOpen(true)}
      >
        Cookie preferences
      </button>
    ) : null;
  }
  const choose = (value: "granted" | "denied") => {
    setAnalyticsConsent(value);
    setOpen(false);
  };
  return (
    <aside
      aria-label="Cookie preferences"
      className="ph-no-capture analytics-consent"
    >
      <div
        className="analytics-consent-panel"
        role="region"
        aria-labelledby="analytics-consent-title"
      >
        <h2 id="analytics-consent-title">Allow cookies?</h2>
        <p>
          We use optional analytics cookies to understand how our site is used
          and improve your experience.
        </p>
        <div className="analytics-consent-actions">
          <Button variant="secondary" onClick={() => choose("denied")}>
            Reject
          </Button>
          <Button onClick={() => choose("granted")}>Allow cookies</Button>
        </div>
      </div>
    </aside>
  );
}
