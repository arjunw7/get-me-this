"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnchoredPopover } from "./anchored-popover";
import { fieldErrorClassName, fieldLabelClassName } from "./styles";

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
    return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
}
function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
function todayDate() {
  const date = new Date();
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function shiftDays(value: string, amount: number) {
  const date = parseDate(value)!;
  date.setUTCDate(date.getUTCDate() + amount);
  return date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999
    ? value
    : iso(date);
}
function shiftMonth(value: string, amount: number) {
  const date = parseDate(value)!;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return value;
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, last.getUTCDate()));
  return iso(date);
}
const longDate = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthName = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Text entry stays available; the calendar only emits real canonical dates. */
export function DateField({
  id,
  name,
  label,
  value,
  onChange,
  error,
  min,
  max,
  disabled = false,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [calendar, setCalendar] = useState<{
    active: string;
    today: string;
  } | null>(null);
  function close(restoreFocus: boolean) {
    setCalendar(null);
    if (restoreFocus) button.current?.focus();
  }
  function show() {
    const today = todayDate();
    let active = parseDate(value) ? value : today;
    if (min && parseDate(min) && active < min) active = min;
    if (max && parseDate(max) && active > max) active = max;
    setCalendar({ active, today });
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={fieldLabelClassName}>
        {label}
      </label>
      <div ref={anchor} className="relative">
        <input
          id={id}
          name={name}
          type="text"
          value={value}
          disabled={disabled}
          placeholder="YYYY-MM-DD"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-format${error ? ` ${id}-error` : ""}`}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.altKey && event.key === "ArrowDown") {
              event.preventDefault();
              show();
            }
          }}
          className={`h-control-md w-full min-w-0 rounded-control border-2 bg-surface-raised pl-3.5 pr-12 text-body tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info ${error ? "border-feedback-error" : "border-outline-strong"}`}
        />
        <button
          ref={button}
          type="button"
          aria-label={`Choose ${label.toLowerCase()}`}
          aria-haspopup="dialog"
          aria-expanded={Boolean(calendar)}
          disabled={disabled}
          onClick={() => {
            if (calendar) close(true);
            else show();
          }}
          className="absolute bottom-0.5 right-0.5 top-0.5 flex w-11 cursor-pointer items-center justify-center rounded-control text-content-primary hover:bg-accent-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M16 3v4M8 3v4M3 11h18M8 15h2" />
          </svg>
        </button>
        {calendar && !disabled ? (
          <AnchoredPopover anchor={anchor} onDismiss={close} width={352}>
            <Calendar
              id={`${id}-calendar`}
              active={calendar.active}
              today={calendar.today}
              selected={value}
              min={min}
              max={max}
              onMove={(active) => setCalendar({ ...calendar, active })}
              onSelect={(date) => {
                onChange(date);
                close(true);
              }}
              onClose={() => close(true)}
            />
          </AnchoredPopover>
        ) : null}
      </div>
      <span id={`${id}-format`} className="sr-only">
        Enter a date as YYYY-MM-DD, or use Choose {label.toLowerCase()}.
      </span>
      {error ? (
        <p id={`${id}-error`} className={fieldErrorClassName}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Calendar({
  id,
  active,
  today,
  selected,
  min,
  max,
  onMove,
  onSelect,
  onClose,
}: {
  id: string;
  active: string;
  today: string;
  selected: string;
  min?: string;
  max?: string;
  onMove: (value: string) => void;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const date = parseDate(active)!;
  const month = active.slice(0, 7);
  const first = parseDate(`${month}-01`)!;
  const final = new Date(first);
  final.setUTCMonth(final.getUTCMonth() + 1, 0);
  const leading = (first.getUTCDay() + 6) % 7;
  const days = Array.from(
    { length: leading + final.getUTCDate() },
    (_, index) =>
      index < leading
        ? null
        : `${month}-${String(index - leading + 1).padStart(2, "0")}`,
  );
  const allowed = (value: string) =>
    (!min || !parseDate(min) || value >= min) &&
    (!max || !parseDate(max) || value <= max);
  useEffect(() => {
    root.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${active}"]`)
      ?.focus();
  }, [active]);
  function move(next: string) {
    if (allowed(next)) onMove(next);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, value: string) {
    const day = parseDate(value)!;
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -((day.getUTCDay() + 6) % 7),
      End: 6 - ((day.getUTCDay() + 6) % 7),
    };
    if (event.key in offsets) {
      event.preventDefault();
      move(shiftDays(value, offsets[event.key]));
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      move(
        shiftMonth(
          value,
          (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1),
        ),
      );
    }
  }
  const previous = shiftMonth(active, -1),
    next = shiftMonth(active, 1);
  function monthAvailable(value: string) {
    const start = parseDate(`${value.slice(0, 7)}-01`)!;
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    return (!min || iso(end) >= min) && (!max || iso(start) <= max);
  }
  function moveMonth(value: string) {
    move(min && value < min ? min : max && value > max ? max : value);
  }
  return (
    <div
      ref={root}
      role="dialog"
      aria-label="Choose date"
      aria-describedby={`${id}-help`}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          disabled={previous === active || !monthAvailable(previous)}
          onClick={() => moveMonth(previous)}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-control border-2 border-outline-strong bg-surface-page font-bold hover:bg-accent-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info disabled:cursor-not-allowed disabled:opacity-35"
        >
          ←
        </button>
        <h2 aria-live="polite" className="font-display text-lg font-extrabold">
          {monthName.format(date)}
        </h2>
        <button
          type="button"
          aria-label="Next month"
          disabled={next === active || !monthAvailable(next)}
          onClick={() => moveMonth(next)}
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-control border-2 border-outline-strong bg-surface-page font-bold hover:bg-accent-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info disabled:cursor-not-allowed disabled:opacity-35"
        >
          →
        </button>
      </header>
      <p id={`${id}-help`} className="sr-only">
        Use arrow keys for days, Page Up and Page Down for months, and Enter to
        select.
      </p>
      <div role="grid" aria-label={monthName.format(date)}>
        <div role="row" className="grid grid-cols-7">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <span
              key={day}
              role="columnheader"
              className="py-2 text-center text-xs font-bold text-content-muted"
            >
              {day}
            </span>
          ))}
        </div>
        {Array.from({ length: Math.ceil(days.length / 7) }, (_, week) => (
          <div key={week} role="row" className="grid grid-cols-7">
            {days.slice(week * 7, week * 7 + 7).map((day, index) => (
              <div
                key={day ?? `empty-${index}`}
                role="gridcell"
                aria-selected={day === selected}
              >
                {day ? (
                  <button
                    type="button"
                    data-date={day}
                    aria-label={longDate.format(parseDate(day)!)}
                    aria-current={day === today ? "date" : undefined}
                    tabIndex={day === active ? 0 : -1}
                    disabled={!allowed(day)}
                    onClick={() => onSelect(day)}
                    onKeyDown={(event) => keyboard(event, day)}
                    className={`flex h-11 w-full cursor-pointer items-center justify-center rounded-control border-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent-info disabled:cursor-not-allowed disabled:opacity-30 ${day === selected ? "border-outline-strong bg-action-primary" : day === today ? "border-outline-strong bg-accent-highlight-soft" : "border-transparent hover:bg-surface-sunken"}`}
                  >
                    {Number(day.slice(-2))}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
      <footer className="mt-3 flex items-center justify-between border-t-2 border-outline-subtle pt-2">
        <button
          type="button"
          disabled={!allowed(today)}
          onClick={() => onSelect(today)}
          className="min-h-11 cursor-pointer rounded-control px-3 text-sm font-bold underline hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info disabled:opacity-35"
        >
          Today
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 cursor-pointer rounded-control px-3 text-sm font-bold underline hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info"
        >
          Close calendar
        </button>
      </footer>
    </div>
  );
}
