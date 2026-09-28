"use client";

import { useId, useState, type FormEvent } from "react";

import { buttonClassName, cx } from "@/src/ui/styles";
import { ArrowRightIcon } from "@/src/landing/icons";
import {
  authCardClassName,
  authInputClassName,
  AuthLayout,
} from "./auth-layout";
import { PreviewNotice } from "./preview-notice";
import {
  parseOnboardingVariant,
  TASTE_LINE_MAX,
  TASTE_LINE_SUGGESTIONS,
  type OnboardingVariant,
} from "./fixtures";

/**
 * Static first-time onboarding screen, ported from the frozen V18 reference
 * (pages/auth/Onboarding.tsx): display name (required) and the optional
 * one-line taste field with suggestion chips.
 *
 * STATIC PREVIEW BOUNDARY: no profile is saved and nothing navigates. A
 * valid submission reveals the preview notice instead. The `?state=validation`
 * fixture renders the designed validation state directly (touched, empty
 * name) for review and capture; it is also reachable by submitting the
 * default state with an empty name.
 *
 * The reference prefilled the name from the prototype's fake session email;
 * the static slice has no session, so the field starts empty with the
 * reference's placeholder (documented difference).
 */

const NAME_MAX = 40;
const NAME_ERROR = "Friends need something to call you.";

export function OnboardingForm({ variant }: { variant: OnboardingVariant }) {
  const parsed = parseOnboardingVariant(variant);
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [touched, setTouched] = useState(parsed === "validation");
  const [preview, setPreview] = useState(false);
  const nameErrorId = useId();
  const noticeId = useId();
  const lineHelpId = useId();

  const nameError = touched && name.trim() === "";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (name.trim() === "") {
      setPreview(false);
      return;
    }
    // Static slice: no profile is saved, nobody navigates. Say so.
    setPreview(true);
  }

  return (
    <AuthLayout back={{ href: "/", label: "Home" }}>
      <div className={authCardClassName}>
        <p className="text-center text-sm font-bold text-feedback-error">
          One last thing
        </p>
        <h1 className="mt-2 text-center font-display text-4xl leading-[1] font-extrabold tracking-tight sm:text-display-xl">
          Tell friends who you are.
        </h1>
        <p className="mt-3 text-center text-lg text-content-secondary">
          This is how you’ll show up in groups and on your wishlist.
        </p>

        <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-6">
          <div className="block">
            <label htmlFor="display-name" className="block text-sm font-bold">
              What should friends call you?
            </label>
            <input
              id="display-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Arjun"
              autoComplete="name"
              maxLength={NAME_MAX}
              aria-invalid={nameError || undefined}
              aria-describedby={nameError ? nameErrorId : undefined}
              className={cx(authInputClassName({ invalid: nameError }), "pl-4")}
            />
            {nameError ? (
              <span
                id={nameErrorId}
                role="alert"
                className="mt-1.5 block text-sm font-semibold text-feedback-error"
              >
                {NAME_ERROR}
              </span>
            ) : null}
          </div>

          <div className="block">
            <label htmlFor="personality-line" className="text-sm font-bold">
              Describe your taste in one line{" "}
              <span className="font-semibold text-content-muted">
                (optional)
              </span>
            </label>
            <input
              id="personality-line"
              value={line}
              onChange={(event) =>
                setLine(event.target.value.slice(0, TASTE_LINE_MAX))
              }
              placeholder="e.g. currently in my tiny-luxuries era"
              maxLength={TASTE_LINE_MAX}
              aria-describedby={lineHelpId}
              className={cx(authInputClassName({ invalid: false }), "pl-4")}
            />
            <div
              id={lineHelpId}
              className="mt-1.5 flex items-center justify-between text-caption text-content-muted"
            >
              <span>Shows under your name. Helps friends pick.</span>
              <span className="tabular-nums">
                {line.length}/{TASTE_LINE_MAX}
              </span>
            </div>
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="group"
              aria-label="Suggestions"
            >
              {TASTE_LINE_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setLine(suggestion)}
                  aria-pressed={line === suggestion}
                  className={cx(
                    "inline-flex min-h-9 items-center rounded-pill border-2 px-3 text-sm font-semibold",
                    "transition-colors duration-[var(--duration-press)] ease-snap",
                    line === suggestion
                      ? "border-outline-strong bg-outline-strong text-surface-page"
                      : "border-outline-strong/20 bg-surface-raised hover:border-outline-strong",
                  )}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {preview ? <PreviewNotice id={noticeId} /> : null}

          <button
            type="submit"
            className={cx(
              buttonClassName({ variant: "primary", size: "lg" }),
              "w-full",
            )}
          >
            Let’s go <ArrowRightIcon className="h-5 w-5" />
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
