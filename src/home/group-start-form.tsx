"use client";

import { useState } from "react";
import type { OccasionType } from "@/src/groups/occasions";

const IDEAS: readonly {
  value: OccasionType;
  label: string;
  suggestion: string;
  tone: string;
}[] = [
  {
    value: "birthday",
    label: "Birthday",
    suggestion: "Birthday plans",
    tone: "bg-action-primary",
  },
  {
    value: "diwali",
    label: "Diwali",
    suggestion: "Diwali night",
    tone: "bg-accent-highlight",
  },
  {
    value: "eid",
    label: "Eid",
    suggestion: "Eid together",
    tone: "bg-accent-fresh",
  },
  {
    value: "wedding",
    label: "Wedding",
    suggestion: "Wedding celebrations",
    tone: "bg-accent-info",
  },
  {
    value: "secret_santa",
    label: "Secret Santa",
    suggestion: "Our Secret Santa",
    tone: "bg-content-primary",
  },
];

export function GroupStartForm({ hasGroups }: { hasGroups: boolean }) {
  const [occasion, setOccasion] = useState("");
  const [name, setName] = useState("");
  const [suggested, setSuggested] = useState(false);
  return (
    <form
      action="/groups/new"
      method="get"
      aria-labelledby="group-create-title"
      className={`rounded-surface-xl border-2 border-outline-strong bg-surface-raised p-6 sm:p-7 ${hasGroups ? "" : "shadow-chunk"}`}
    >
      <h2
        id="group-create-title"
        className="font-display text-2xl font-extrabold leading-tight"
      >
        {hasGroups ? "Create another group" : "Create a group"}
      </h2>
      <p className="mt-2 text-[15px] text-content-secondary">
        For a birthday, Diwali, or anything worth celebrating. Friends see your
        wishlist once they join.
      </p>
      <fieldset className="mt-5">
        <legend className="text-sm font-bold text-content-secondary">
          Pick an occasion
        </legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {IDEAS.map((idea) => (
            <label key={idea.value} className="relative cursor-pointer">
              <input
                type="radio"
                name="occasion"
                value={idea.value}
                checked={occasion === idea.value}
                onChange={() => {
                  setOccasion(idea.value);
                  setName(idea.suggestion);
                  setSuggested(true);
                }}
                className="peer sr-only"
              />
              <span className="inline-flex h-12 items-center gap-2 rounded-surface border-2 border-outline-strong bg-surface-page px-4 font-display text-[15px] font-extrabold peer-checked:bg-accent-highlight peer-checked:shadow-chunk-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring">
                <span
                  aria-hidden="true"
                  className={`h-3 w-3 rounded-full border-2 border-outline-strong ${idea.tone}`}
                />
                {idea.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-5 block">
        <span className="text-sm font-bold">Group name</span>
        <div className="relative">
          <input
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setSuggested(false);
            }}
            maxLength={80}
            placeholder="e.g. Birthday plans"
            className={`mt-1.5 h-12 w-full min-w-0 rounded-control border-2 border-outline-strong bg-surface-sunken px-3.5 text-base placeholder:text-content-muted focus:bg-surface-raised ${suggested ? "pr-24" : ""}`}
          />
          {suggested && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-2 top-1/2 mt-0.5 -translate-y-1/2 rounded-md bg-content-primary px-2 py-1 text-xs font-bold text-surface-page"
            >
              Suggested
            </span>
          )}
        </div>
      </label>
      <button
        type="submit"
        className="mt-5 inline-flex h-12 items-center gap-2 rounded-surface border-2 border-outline-strong bg-action-primary px-5 font-bold shadow-chunk-sm"
      >
        Create a group <span aria-hidden="true">→</span>
      </button>
    </form>
  );
}
