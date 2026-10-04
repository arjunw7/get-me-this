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

/** Always reachable; no consent means neither browser nor server capture. */
export function AnalyticsConsentControl() {
  const choice = useSyncExternalStore(
    subscribe,
    getAnalyticsConsent,
    () => "pending",
  );
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [open, setOpen] = useState(false);
  if (!hydrated || !isClientAnalyticsConfigured()) return null;
  const choose = (value: "granted" | "denied") => {
    setAnalyticsConsent(value);
    setOpen(false);
  };
  return (
    <aside
      aria-label="Analytics preferences"
      className="ph-no-capture analytics-consent"
    >
      {choice === "pending" || open ? (
        <div
          className="analytics-consent-panel"
          role="region"
          aria-labelledby="analytics-consent-title"
        >
          <h2 id="analytics-consent-title">Help make Get Me This better?</h2>
          <p>
            Allow optional usage analytics with PostHog. We keep your wishlist
            content and private gifting details out. Your choice lasts 180 days
            on this browser.
          </p>
          <div className="analytics-consent-actions">
            <Button variant="secondary" onClick={() => choose("denied")}>
              {choice === "granted" ? "Stop analytics" : "No thanks"}
            </Button>
            <Button onClick={() => choose("granted")}>Allow analytics</Button>
          </div>
        </div>
      ) : (
        <button
          className="analytics-consent-trigger"
          onClick={() => setOpen(true)}
        >
          Analytics preferences
        </button>
      )}
    </aside>
  );
}
