"use client";

import {
  useCallback,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import { cx } from "@/src/ui/styles";

/**
 * Six-digit one-time-code input, ported from the frozen V18 reference
 * (components/auth/OtpInput.tsx) with token-mapped classes.
 *
 * Unlike the prototype's `outline-none`, the global :focus-visible ring is
 * preserved: production accessibility takes precedence over prototype
 * shortcuts.
 */

export type OtpInputProps = {
  digits: string[];
  onChange: (digits: string[]) => void;
  /** Marks every cell invalid and is announced with the group. */
  invalid?: boolean;
  disabled?: boolean;
  labelledBy: string;
  describedBy?: string;
};

export function OtpInput({
  digits,
  onChange,
  invalid = false,
  disabled = false,
  labelledBy,
  describedBy,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setRef = useCallback((index: number, el: HTMLInputElement | null) => {
    refs.current[index] = el;
  }, []);

  function fillFrom(start: number, chars: string) {
    const next = [...digits];
    let last = start;
    chars
      .slice(0, 6 - start)
      .split("")
      .forEach((ch, k) => {
        next[start + k] = ch;
        last = start + k;
      });
    onChange(next);
    refs.current[Math.min(last + 1, 5)]?.focus();
  }

  function handleChange(index: number, raw: string) {
    const value = raw.replace(/\D/g, "");
    if (!value) {
      const next = [...digits];
      next[index] = "";
      onChange(next);
      return;
    }
    fillFrom(index, value);
  }

  function handleKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      onChange(next);
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      // Focus movement is handled here, so the native default (which
      // executes after the focus change and collapses the target cell's
      // select-on-focus back to cursor position 0) must not run.
      // Production keyboard behavior takes precedence over the
      // prototype's shortcut.
      event.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < 5) {
      event.preventDefault();
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!text) return;
    event.preventDefault();
    fillFrom(0, text);
  }

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="flex justify-between gap-2 sm:gap-3"
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => setRef(index, el)}
          value={digit}
          disabled={disabled}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={6}
          aria-label={`Digit ${index + 1} of 6`}
          aria-invalid={invalid || undefined}
          className={cx(
            "h-control-lg w-full min-w-0 max-w-14 rounded-surface text-center font-display text-2xl font-extrabold tabular-nums",
            "transition-colors duration-[var(--duration-press)] ease-snap focus:shadow-chunk-sm disabled:opacity-60 sm:h-16",
            invalid
              ? "border-feedback-error bg-feedback-error-soft"
              : digit
                ? "border-outline-strong bg-surface-raised"
                : "border-outline-strong/40 bg-surface-raised",
            "border-2",
          )}
        />
      ))}
    </div>
  );
}
