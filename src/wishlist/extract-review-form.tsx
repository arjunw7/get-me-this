"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ReviewPhotoPicker } from "./review-photo-picker";

import type { ItemActionState } from "./item-actions";
import type { CreateDraft, ItemFields } from "./item-input";
import { CurrencySelect } from "./currency-select";

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

const DESIRE_CHOICES = [
  ["really_want", "Really want", "Top of the list"],
  ["would_love", "Would love", "Solid yes"],
  ["just_an_idea", "Just an idea", "No pressure"],
] as const;

const fieldClass =
  "mt-2 min-h-control-md w-full min-w-0 rounded-control border-2 border-outline-strong bg-surface-raised py-2.5 text-base font-normal text-content-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong";
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
      if (element) {
        const disclosure = element.closest("details");
        if (disclosure) disclosure.open = true;
        element.focus();
      } else document.getElementById("review-desire-error")?.focus();
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

  return (
    <form
      action={formAction}
      noValidate
      className="flex w-full flex-col gap-7 pb-28 lg:pb-12"
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-10">
        <div className="min-w-0">
          <ReviewPhotoPicker
            candidates={candidates}
            selectedImage={selectedImage}
            onSelectImage={onSelectImage}
          />
          {reviewPhase === "extracted" ? (
            <details className="mt-4 text-sm">
              <summary className="flex min-h-touch-min cursor-pointer items-center font-bold underline underline-offset-4">
                Edit product link
              </summary>
              <label className={labelClass}>
                Link (optional)
                <input
                  id={FIELD_IDS.sourceUrl}
                  className={`${fieldClass} px-3`}
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
                <p
                  id="sourceUrl-error"
                  className="mt-2 text-sm text-feedback-error"
                >
                  {errors.sourceUrl}
                </p>
              ) : null}
              {onRetryExtract ? (
                <button
                  type="button"
                  onClick={onRetryExtract}
                  className="mt-2 inline-flex min-h-touch-min items-center font-bold underline underline-offset-4"
                >
                  Try the link again
                </button>
              ) : null}
            </details>
          ) : null}
        </div>

        {/* Fields column */}
        <div className="flex min-w-0 flex-col gap-5">
          <label className={labelClass}>
            Item name
            <input
              id={FIELD_IDS.title}
              className={`${fieldClass} px-3`}
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

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass}>
                Shop (optional)
                <input
                  id={FIELD_IDS.retailer}
                  className={`${fieldClass} px-3`}
                  name="retailer"
                  value={draft.retailer}
                  onChange={(event) =>
                    onFieldChange("retailer", event.target.value)
                  }
                  aria-invalid={Boolean(errors.retailer)}
                  aria-describedby={
                    errors.retailer ? "retailer-error" : undefined
                  }
                />
              </label>
              {errors.retailer ? (
                <p id="retailer-error" className="text-sm text-feedback-error">
                  {errors.retailer}
                </p>
              ) : null}
            </div>
            <fieldset
              className="min-w-0"
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? "amount-error" : undefined}
            >
              <legend className={labelClass}>Price (optional)</legend>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                <label className="sr-only" htmlFor={FIELD_IDS.currency}>
                  Currency
                </label>
                <CurrencySelect
                  id={FIELD_IDS.currency}
                  className="mt-2"
                  name="currency"
                  value={draft.currency}
                  onChange={(code) => onFieldChange("currency", code)}
                />
                <label className="sr-only" htmlFor={FIELD_IDS.amount}>
                  Price
                </label>
                <input
                  id={FIELD_IDS.amount}
                  className={`${fieldClass} px-3`}
                  name="amount"
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={(event) =>
                    onFieldChange("amount", event.target.value)
                  }
                  aria-invalid={Boolean(errors.amount)}
                  aria-describedby={errors.amount ? "amount-error" : undefined}
                />
              </div>
              {errors.amount ? (
                <p id="amount-error" className="text-sm text-feedback-error">
                  {errors.amount}
                </p>
              ) : null}
            </fieldset>
          </div>

          {reviewPhase === "manual" ? (
            <div>
              <label className={labelClass}>
                Link (optional)
                <input
                  id={FIELD_IDS.sourceUrl}
                  className={`${fieldClass} px-3`}
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
            </div>
          ) : null}

          <label className={labelClass}>
            Note (optional)
            <textarea
              id={FIELD_IDS.note}
              className={`${fieldClass} h-25 resize-y px-3 py-3`}
              placeholder="Size, colour, or just vibes. “The cream one, not the sage.”"
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
            <div className="mt-2 grid grid-cols-3 gap-2">
              {DESIRE_CHOICES.map(([value, label, description], index) => (
                <label
                  key={value}
                  className="relative flex min-w-0 cursor-pointer"
                >
                  <input
                    type="radio"
                    className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                    aria-label={label}
                    name="desireLevel"
                    value={value}
                    id={index === 0 ? FIELD_IDS.desireLevel : undefined}
                    checked={draft.desireLevel === value}
                    onChange={(event) =>
                      onFieldChange("desireLevel", event.target.value)
                    }
                  />
                  <span className="flex min-h-16 w-full flex-col items-center justify-center rounded-surface border-2 border-outline-strong/20 bg-surface-raised px-1 py-2 text-center peer-checked:border-outline-strong peer-checked:bg-accent-highlight-soft peer-checked:shadow-chunk-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring">
                    <span className="text-sm font-bold lowercase">{label}</span>
                    <span className="mt-0.5 text-xs text-content-secondary">
                      {description}
                    </span>
                  </span>
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

      <div className="fixed inset-x-0 bottom-0 z-20 flex flex-col-reverse gap-2 border-t-2 border-outline-strong bg-surface-page px-5 pt-4 pb-3 lg:static lg:flex-row lg:justify-end lg:gap-6 lg:border-0 lg:bg-transparent lg:p-0 lg:pt-3">
        <button
          type="button"
          onClick={onStartOver}
          className="min-h-touch-min px-2 font-bold"
        >
          Start over
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-control-lg min-h-touch-min rounded-surface border-2 border-outline-strong bg-action-primary px-8 text-lg font-bold shadow-chunk disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add item"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {reviewPhase === "manual" && onRetryExtract ? (
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
