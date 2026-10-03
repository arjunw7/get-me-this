"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AnchoredPopover } from "./anchored-popover";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
};

/** Editable ARIA combobox. Only an explicit option selection changes the submitted value. */
export function SearchableSelect({
  id,
  label,
  name,
  value,
  options,
  onChange,
  disabled = false,
  className = "",
  placeholder = "Search options",
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const listId = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeValue, setActiveValue] = useState(value);
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) =>
    `${option.value} ${option.label} ${option.description ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const active = filtered.findIndex((option) => option.value === activeValue);
  const activeIndex = active < 0 ? 0 : active;
  const activeOption = filtered[activeIndex];
  useEffect(() => {
    if (open && activeOption)
      document
        .getElementById(`${listId}-${activeOption.value}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, activeOption, listId]);
  function close(restoreFocus: boolean) {
    setOpen(false);
    setQuery("");
    if (restoreFocus) input.current?.focus();
  }
  function show() {
    if (disabled) return;
    setQuery("");
    setActiveValue(value);
    setOpen(true);
  }
  function choose(option: SelectOption) {
    onChange(option.value);
    close(true);
  }
  function keyboard(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      else if (filtered.length) {
        const next =
          (activeIndex +
            (event.key === "ArrowDown" ? 1 : -1) +
            filtered.length) %
          filtered.length;
        setActiveValue(filtered[next].value);
      }
    } else if (open && event.key === "Enter") {
      event.preventDefault();
      if (activeOption) choose(activeOption);
    } else if (open && event.key === "Tab") close(false);
  }
  return (
    <div ref={anchor} className={`relative min-w-0 ${className}`}>
      <input type="hidden" name={name} value={value} disabled={disabled} />
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && activeOption ? `${listId}-${activeOption.value}` : undefined
        }
        value={open ? query : (selected?.label ?? value)}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        placeholder={open ? placeholder : undefined}
        onFocus={(event) => {
          if (!open) event.currentTarget.select();
        }}
        onClick={() => {
          if (!open) show();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveValue("");
        }}
        onKeyDown={keyboard}
        className="h-control-md w-full min-w-0 rounded-control border-2 border-outline-strong bg-surface-raised pl-3 pr-11 text-base font-bold text-content-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info disabled:cursor-not-allowed disabled:opacity-60"
      />
      <button
        type="button"
        aria-label={`Choose ${label.toLowerCase()}`}
        tabIndex={-1}
        disabled={disabled}
        onClick={() => {
          if (open) close(true);
          else {
            input.current?.focus();
            show();
          }
        }}
        className="absolute bottom-0.5 right-0.5 top-0.5 flex w-10 cursor-pointer items-center justify-center rounded-control text-content-primary hover:bg-accent-highlight-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-info disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && !disabled ? (
        <AnchoredPopover anchor={anchor} onDismiss={close} width={300}>
          <p className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-content-muted">
            {placeholder}
          </p>
          <div id={listId} role="listbox" aria-label={label}>
            {filtered.map((option, index) => (
              <div
                key={option.value}
                id={`${listId}-${option.value}`}
                role="option"
                aria-label={[option.label, option.description]
                  .filter(Boolean)
                  .join(" ")}
                aria-selected={option.value === value}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
                onPointerMove={() => setActiveValue(option.value)}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 py-2 ${index === activeIndex ? "bg-accent-highlight-soft outline-2 outline-outline-strong" : "hover:bg-surface-sunken"}`}
              >
                <span className="font-bold">{option.label}</span>
                <span className="min-w-0 flex-1 text-sm text-content-secondary">
                  {option.description}
                </span>
                {option.value === value ? (
                  <span aria-hidden="true" className="font-bold">
                    ✓
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          {!filtered.length ? (
            <p
              role="status"
              className="px-2 py-4 text-sm text-content-secondary"
            >
              No matches. Try another search.
            </p>
          ) : null}
        </AnchoredPopover>
      ) : null}
    </div>
  );
}
