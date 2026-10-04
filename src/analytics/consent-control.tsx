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
    () => undefined,
  );
  const [open, setOpen] = useState(false);
  if (choice === undefined || !isClientAnalyticsConfigured()) return null;
  const choose = (value: "granted" | "denied") => {
    setAnalyticsConsent(value);
    setOpen(false);
  };
  return (
    <aside
      aria-label="Cookie preferences"
      className={`ph-no-capture analytics-consent${choice !== "pending" && !open ? " analytics-consent-collapsed" : ""}`}
    >
      {choice === "pending" || open ? (
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
      ) : (
        <button
          className="analytics-consent-trigger"
          onClick={() => setOpen(true)}
        >
          Cookie preferences
        </button>
      )}
    </aside>
  );
}
