"use client";

import { useId } from "react";
import { VIBE_OPTIONS, vibeClasses, type Vibe } from "./vibe";

export function VibePicker({
  value,
  onChange,
  disabled = false,
  invalid = false,
}: {
  value: Vibe;
  onChange: (vibe: Vibe) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const id = useId();
  return (
    <fieldset
      disabled={disabled}
      aria-describedby={invalid ? `${id}-error` : undefined}
    >
      <legend className="text-sm font-bold">Choose your Vibe</legend>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {VIBE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="cursor-pointer has-[:disabled]:cursor-default has-[:disabled]:opacity-60"
          >
            <input
              type="radio"
              name="vibe"
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={`flex h-14 items-center justify-center rounded-surface border-2 border-outline-strong peer-focus-visible:ring-4 peer-focus-visible:ring-focus-ring/40 ${vibeClasses(option.value)} ${value === option.value ? "shadow-chunk-sm" : ""}`}
            >
              {value === option.value ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                >
                  <path d="m5 12 4 4L19 6" />
                </svg>
              ) : null}
            </span>
            <span className="mt-1 block text-center text-xs font-semibold">
              {option.label}
            </span>
          </label>
        ))}
      </div>
      {invalid ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-2 text-sm font-semibold text-feedback-error"
        >
          Choose one of the four vibes.
        </p>
      ) : null}
    </fieldset>
  );
}
