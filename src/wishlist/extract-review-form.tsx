"use client";

import Link from "next/link";
import { useEffect } from "react";

import type { ItemActionState } from "./item-actions";
import type { CreateDraft, ItemFields } from "./item-input";
import { SUPPORTED_CURRENCY_CODES } from "./currency-metadata";

/**
 * The 005f review/fallback form composition (V18 `ItemForm` ported to the
 * repository's form vocabulary): every field is prefilled only with what
 * extraction actually proposed and every field stays editable — extracted
 * values receive no implicit trust because the save action revalidates
 * everything through the 005c rules. The image chooser is a labelled radio
 * group over the returned candidates plus an explicit "no photo" option;
 * candidates render as remote thumbnails under `no-referrer`. In the
 * manual fallback the chooser is replaced by the 005c noninteractive photo
 * placeholder. Nothing here saves until the explicit submit.
 */

const QUICK_CURRENCIES = ["INR", "USD", "GBP", "EUR"];
const DESIRE_CHOICES = [
  ["really_want", "Really want"],
  ["would_love", "Would love"],
  ["just_an_idea", "Just an idea"],
] as const;

const fieldClass =
  "mt-1 min-h-touch-min w-full rounded-surface border-2 border-outline-strong bg-surface-raised px-3 text-content-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong";
const labelClass = "block text-sm font-bold text-content-primary";

/** Error display order for "focus moves to the first error". */
const FIELD_ORDER = [
  "title",
  "retailer",
  "amount",
  "sourceUrl",
  "note",
  "desireLevel",
  "submissionId",
] as const;

const FIELD_IDS: Record<keyof ItemFields | "submissionId", string> = {
  title: "review-title",
  sourceUrl: "review-sourceUrl",
  retailer: "review-retailer",
  amount: "review-amount",
  currency: "review-currency",
  note: "review-note",
  desireLevel: "review-desire",
  submissionId: "review-submission-id",
};

export function ExtractReviewForm({
  draft,
  candidates,
  selectedImage,
  onSelectImage,
  partial,
  failed,
  reviewPhase,
  formAction,
  pending,
  actionState,
  onStartOver,
  onRetryExtract,
  onFieldChange,
}: {
  draft: CreateDraft;
  candidates: readonly string[];
  selectedImage: string | null;
  onSelectImage: (value: string | null) => void;
  partial: boolean;
  failed: boolean;
  reviewPhase: "extracted" | "manual";
  formAction: (data: FormData) => void;
  pending: boolean;
  actionState: ItemActionState;
  onStartOver: () => void;
  onRetryExtract?: () => void;
  onFieldChange: (field: keyof CreateDraft, value: string) => void;
}) {
  const errors =
    actionState.status === "invalid" ? (actionState.errors ?? {}) : {};

  // Validation errors move focus to the first erroring field.
  useEffect(() => {
    if (actionState.status !== "invalid") return;
    const fieldErrors = actionState.errors ?? {};
    const first = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (first) {
      const element = document.getElementById(FIELD_IDS[first]);
      if (element) element.focus();
      else document.getElementById("review-desire-error")?.focus();
    }
  }, [actionState]);

  const statusCopy =
    actionState.status === "unavailable"
      ? "We couldn’t save that item just now. Your details are still here; try again."
      : actionState.status === "retry"
        ? "This item changed while you were editing. Reload the page before trying again."
        : actionState.status === "submission-conflict"
          ? "This entry was already saved with different details. Your updated draft is still here."
          : null;

  const desireError = errors.desireLevel;
  const showChooser = reviewPhase === "extracted" && candidates.length > 0;

  return (
    <form
      action={formAction}
      noValidate
      className="mx-auto w-full max-w-2xl space-y-6 pb-28 sm:pb-12"
    >
      {failed ? (
        <div
          role="alert"
          className="rounded-surface border-2 border-outline-strong bg-accent-highlight-soft p-4"
        >
          <p className="font-bold">We couldn’t read that shop.</p>
          <p className="mt-0.5 text-content-secondary">
            Some shops hide their details from us. Fill in the basics below and
            it works exactly the same.
          </p>
        </div>
      ) : null}
      {partial ? (
        <p
          role="status"
          className="rounded-surface border-2 border-outline-strong bg-surface-raised p-3"
        >
          Some details couldn’t be read. Fill in anything missing below.
        </p>
      ) : null}
      {statusCopy ? (
        <p
          role="alert"
          className="rounded-surface border-2 border-outline-strong bg-surface-raised p-3"
        >
          {statusCopy}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:gap-10">
        {/* Photo column */}
        <div>
          {showChooser ? (
            <fieldset aria-describedby="photo-choice-help">
              <legend className={labelClass}>
                Pick the photo friends will see
              </legend>
              <div className="mt-2 flex flex-wrap gap-2.5">
                {candidates.map((src, index) => {
                  const active = selectedImage === src;
                  return (
                    <label
                      key={src}
                      className="relative inline-flex min-h-touch-min min-w-touch-min cursor-pointer items-center justify-center"
                    >
                      <input
                        type="radio"
                        name="photo-choice"
                        className="peer sr-only"
                        checked={active}
                        onChange={() => onSelectImage(src)}
                      />
                      {/* Remote candidate thumbnails render as images
                          under no-referrer; the page itself is never
                          fetched client-side. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`Photo option ${index + 1}`}
                        referrerPolicy="no-referrer"
                        className={`h-16 w-16 rounded-surface-sm border-2 object-cover transition-opacity duration-150 motion-reduce:transition-none peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-action-primary-strong ${
                          active
                            ? "border-outline-strong opacity-100"
                            : "border-transparent opacity-70 hover:opacity-100"
                        }`}
                      />
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-outline-strong bg-action-primary"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </span>
                      ) : null}
                    </label>
                  );
                })}
                <label className="relative inline-flex min-h-touch-min cursor-pointer items-center gap-2 rounded-surface-sm border-2 border-dashed border-outline-strong/40 px-3 text-sm font-bold">
                  <input
                    type="radio"
                    name="photo-choice"
                    className="peer sr-only"
                    checked={selectedImage === null}
                    onChange={() => onSelectImage(null)}
                  />
                  No photo
                </label>
              </div>
              <p
                id="photo-choice-help"
                className="mt-2 text-sm text-content-muted"
              >
                Choosing a photo uploads a private copy friends can see.
              </p>
            </fieldset>
          ) : (
            <div>
              <span className={labelClass}>Photo (optional)</span>
              <div
                aria-hidden="true"
                className="mt-1 rounded-surface border-2 border-dashed border-outline-strong/35 bg-surface-sunken p-5 text-center text-content-muted"
              >
                Photo preview — adding photos isn’t available yet.
              </div>
            </div>
          )}
        </div>

        {/* Fields column */}
        <div className="flex flex-col gap-5">
          <label className={labelClass}>
            Item name
            <input
              id={FIELD_IDS.title}
              className={fieldClass}
              name="title"
              value={draft.title}
              onChange={(event) => onFieldChange("title", event.target.value)}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? "title-error" : undefined}
            />
          </label>
          {errors.title ? (
            <p id="title-error" className="text-sm text-feedback-error">
              {errors.title}
            </p>
          ) : null}

          <label className={labelClass}>
            Shop (optional)
            <input
              id={FIELD_IDS.retailer}
              className={fieldClass}
              name="retailer"
              value={draft.retailer}
              onChange={(event) =>
                onFieldChange("retailer", event.target.value)
              }
              aria-invalid={Boolean(errors.retailer)}
              aria-describedby={errors.retailer ? "retailer-error" : undefined}
            />
          </label>
          {errors.retailer ? (
            <p id="retailer-error" className="text-sm text-feedback-error">
              {errors.retailer}
            </p>
          ) : null}

          <fieldset
            className="space-y-2"
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? "amount-error" : undefined}
          >
            <legend className={labelClass}>Price (optional)</legend>
            <div className="grid grid-cols-[1fr_8rem] gap-3">
              <label className="sr-only" htmlFor={FIELD_IDS.amount}>
                Price
              </label>
              <input
                id={FIELD_IDS.amount}
                className={fieldClass}
                name="amount"
                inputMode="decimal"
                value={draft.amount}
                onChange={(event) =>
                  onFieldChange("amount", event.target.value)
                }
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={errors.amount ? "amount-error" : undefined}
              />
              <label className="sr-only" htmlFor={FIELD_IDS.currency}>
                Currency
              </label>
              <select
                id={FIELD_IDS.currency}
                className={fieldClass}
                name="currency"
                value={draft.currency}
                onChange={(event) =>
                  onFieldChange("currency", event.target.value)
                }
              >
                {Array.from(
                  new Set([...QUICK_CURRENCIES, ...SUPPORTED_CURRENCY_CODES]),
                ).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            {errors.amount ? (
              <p id="amount-error" className="text-sm text-feedback-error">
                {errors.amount}
              </p>
            ) : null}
          </fieldset>

          <label className={labelClass}>
            Link (optional)
            <input
              id={FIELD_IDS.sourceUrl}
              className={fieldClass}
              name="sourceUrl"
              type="url"
              value={draft.sourceUrl}
              onChange={(event) =>
                onFieldChange("sourceUrl", event.target.value)
              }
              aria-invalid={Boolean(errors.sourceUrl)}
              aria-describedby={
                errors.sourceUrl ? "sourceUrl-error" : undefined
              }
            />
          </label>
          {errors.sourceUrl ? (
            <p id="sourceUrl-error" className="text-sm text-feedback-error">
              {errors.sourceUrl}
            </p>
          ) : null}

          <label className={labelClass}>
            Note (optional)
            <textarea
              id={FIELD_IDS.note}
              className={`${fieldClass} min-h-28 py-2`}
              name="note"
              value={draft.note}
              onChange={(event) => onFieldChange("note", event.target.value)}
              aria-invalid={Boolean(errors.note)}
              aria-describedby={errors.note ? "note-error" : undefined}
            />
          </label>
          {errors.note ? (
            <p id="note-error" className="text-sm text-feedback-error">
              {errors.note}
            </p>
          ) : null}

          <fieldset
            aria-invalid={Boolean(desireError)}
            aria-describedby={desireError ? "review-desire-error" : undefined}
          >
            <legend className={labelClass}>How much do you want it?</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {DESIRE_CHOICES.map(([value, label], index) => (
                <label
                  key={value}
                  className="inline-flex min-h-touch-min items-center gap-2 rounded-surface border-2 border-outline-strong px-3"
                >
                  <input
                    type="radio"
                    name="desireLevel"
                    value={value}
                    id={index === 0 ? FIELD_IDS.desireLevel : undefined}
                    checked={draft.desireLevel === value}
                    onChange={(event) =>
                      onFieldChange("desireLevel", event.target.value)
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {desireError ? (
            <p
              id="review-desire-error"
              role="alert"
              className="text-sm text-feedback-error"
            >
              {desireError}
            </p>
          ) : null}
        </div>
      </div>

      <input type="hidden" name="submissionId" value={draft.submissionId} />
      <input type="hidden" name="reviewPhase" value={reviewPhase} />
      <input
        type="hidden"
        name="candidateImageUrl"
        value={selectedImage ?? ""}
      />

      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t-2 border-outline-strong bg-surface-page/95 p-4 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <button
          type="button"
          onClick={onStartOver}
          className="min-h-touch-min flex-1 rounded-surface border-2 border-outline-strong bg-surface-raised px-4 font-bold"
        >
          Start over
        </button>
        <button
          type="submit"
          disabled={pending}
          className="min-h-touch-min flex-1 rounded-surface border-2 border-outline-strong bg-action-primary px-4 font-bold shadow-chunk disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add item"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {onRetryExtract ? (
          <button
            type="button"
            onClick={onRetryExtract}
            className="inline-flex min-h-touch-min items-center font-bold underline underline-offset-4"
          >
            Try the link again
          </button>
        ) : null}
        {actionState.status === "submission-conflict" &&
        actionState.savedItemId ? (
          <Link
            href={`/wishlist/items/${actionState.savedItemId}/edit`}
            className="inline-flex min-h-touch-min items-center font-bold underline underline-offset-4"
          >
            Edit saved item
          </Link>
        ) : null}
      </div>
    </form>
  );
}
