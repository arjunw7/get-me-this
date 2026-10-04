"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { parseExtractResponse } from "./extract-response";
import { ExtractReviewForm } from "./extract-review-form";
import { createDraftDefaults } from "./item-drafts";
import { prefillOriginal, type CreateDraft } from "./item-input";
import type { ItemActionState } from "./item-actions";
import { createReviewedItemAction } from "./review-actions";
import type { ExtractionResultShape } from "./extract-response";

/**
 * The 005f extraction-review state machine (client interactivity only;
 * every save and every remote fetch of page content happens on the
 * server). States on the protected `/wishlist/items/new` route, ported
 * from the frozen V18 `AddFromLink` composition with the brief's pinned
 * deviations (no `added` step, no conversion preview or manual image upload):
 *
 * 1. `input` — the V18 initial URL entry; `?url=` seeds the field.
 * 2. `loading` — the bounded extracting state (12s client wait over the
 *    005e 10s server deadline) with Cancel; cancellation returns to input
 *    with the URL preserved.
 * 3. `review` — extracted or partial review; nothing is saved until the
 *    explicit submit through the 005c contract.
 * 4. `manual` — the fallback for failure, admission denial, blocked URL,
 *    or deliberate manual entry; the pasted URL and entered data survive.
 *
 * The only network call this component makes is the same-origin extract
 * route. Extract responses are untrusted: a malformed or unexpected
 * envelope renders the generic failure state and leaks nothing into the
 * DOM.
 */

type Step = "input" | "loading" | "review" | "manual";

// ARJ-62: each step brings its own column width. Entry and extracting keep
// the narrow reading column (--spacing-content-max, 520px); review and the
// manual fallback need the wide container for their two-column composition.
// Width must follow the STEP: the paste-into-empty-page path has no ?url=,
// and pinning the width to the server-known param crushed the review/manual
// form into the 520px entry column (sliver inputs, overlapping fields).
const ENTRY_COLUMN = "mx-auto w-full max-w-[var(--spacing-content-max)]";
const WIDE_COLUMN = "mx-auto w-full max-w-4xl sm:px-5";

/** The client wait: the 35s managed-provider deadline plus admission margin. */
const EXTRACT_WAIT_MS = 37_000;

const INITIAL_ACTION_STATE: ItemActionState = { status: "idle" };

function newSubmissionId(): string {
  return crypto.randomUUID();
}

function displayHost(value: string): string {
  try {
    return new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    ).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function isCompleteResult(result: ExtractionResultShape): boolean {
  return (
    typeof result.title === "string" &&
    typeof result.retailer === "string" &&
    !!result.originalAmountMinor &&
    !!result.originalCurrency &&
    result.candidateImageUrls.length > 0
  );
}

export function AddItemFlow({
  initialUrl,
  starterIdea,
}: {
  initialUrl: string;
  starterIdea?: { label: string; prompt: string; note: string } | null;
}) {
  const [step, setStep] = useState<Step>("input");
  const [link, setLink] = useState(initialUrl);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [host, setHost] = useState("");
  const [draft, setDraft] = useState<CreateDraft>(() => ({
    ...createDraftDefaults(newSubmissionId()),
    note: starterIdea?.note ?? "",
  }));
  const [candidates, setCandidates] = useState<readonly string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);
  const [failed, setFailed] = useState(false);
  const [actionState, formAction, pending] = useActionState(
    createReviewedItemAction,
    INITIAL_ACTION_STATE,
  );

  const abortRef = useRef<AbortController | null>(null);
  const cancelRef = useRef(false);
  const submissionRef = useRef(draft.submissionId);
  const autoStarted = useRef(false);

  const enterManual = useCallback(
    (url: string, retain: CreateDraft | undefined, failure: boolean) => {
      const base = retain ?? {
        ...createDraftDefaults(submissionRef.current),
        note: starterIdea?.note ?? "",
      };
      setDraft({
        ...base,
        sourceUrl: url,
        submissionId: submissionRef.current,
      });
      setCandidates([]);
      setSelectedImage(null);
      setPartial(false);
      setFailed(failure);
      setStep("manual");
    },
    [starterIdea?.note],
  );

  const applyResult = useCallback(
    (result: ExtractionResultShape, url: string, retain?: CreateDraft) => {
      const base = retain ?? {
        ...createDraftDefaults(submissionRef.current),
        note: starterIdea?.note ?? "",
      };
      // The extractor reports minor units as a decimal string; the form's
      // amount field is major units rendered back through the same frozen
      // currency table the save validation uses (never a conversion).
      const pair =
        result.originalAmountMinor && result.originalCurrency
          ? prefillOriginal({
              original_amount_minor: result.originalAmountMinor,
              original_currency: result.originalCurrency,
            })
          : null;
      setDraft({
        ...base,
        // A new result proposes values only for what arrived; the draft's
        // entered fields are retained for everything else.
        title: result.title ?? base.title,
        retailer: result.retailer ?? base.retailer,
        sourceUrl: result.sourceUrl || url,
        amount:
          pair?.mode === "supported" ? pair.amount : (retain?.amount ?? ""),
        currency:
          pair?.mode === "supported"
            ? pair.currency
            : (retain?.currency ?? "INR"),
        note: base.note,
        desireLevel: base.desireLevel,
        submissionId: submissionRef.current,
      });
      setCandidates(result.candidateImageUrls);
      setSelectedImage(result.candidateImageUrls[0] ?? null);
      // A result whose price carries a valid ISO code OUTSIDE the frozen
      // supported-currency table cannot be rendered or saved as a price
      // (prefillOriginal resolves it to "opaque" and drops it), so it is
      // classified as PARTIAL: the partial notice applies and the price
      // fields stay empty for manual entry. A currency is never invented.
      const unsupportedCurrency = pair?.mode === "opaque";
      setPartial(unsupportedCurrency || !isCompleteResult(result));
      setFailed(false);
      setStep("review");
    },
    [starterIdea?.note],
  );

  const runExtract = useCallback(
    async (url: string, retain?: CreateDraft) => {
      const trimmed = url.trim();
      if (!trimmed) {
        setLinkError("Paste a link first.");
        setStep("input");
        return;
      }
      setLinkError(null);
      setHost(displayHost(trimmed));
      setStep("loading");
      cancelRef.current = false;
      const controller = new AbortController();
      abortRef.current = controller;
      const timer = window.setTimeout(
        () => controller.abort(),
        EXTRACT_WAIT_MS,
      );
      try {
        const response = await fetch("/wishlist/items/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: trimmed }),
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        const parsed = parseExtractResponse(response.status, body);
        if (parsed.kind === "result") {
          applyResult(parsed.result, trimmed, retain);
        } else {
          enterManual(trimmed, retain, true);
        }
      } catch {
        if (cancelRef.current) {
          setStep("input");
        } else {
          enterManual(trimmed, retain, true);
        }
      } finally {
        window.clearTimeout(timer);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [applyResult, enterManual],
  );

  // A pasted URL carried in the route starts the extraction straight away
  // (and a reload during review restarts extraction from it). The kick is
  // called directly in the effect body — never behind a setTimeout — so
  // React StrictMode's development double-mount (effect runs, cleanup,
  // effect re-runs) cannot cancel a scheduled kick before it fires: the
  // autoStarted ref alone keeps it to exactly one run per mounted flow.
  useEffect(() => {
    if (autoStarted.current || !initialUrl.trim()) return;
    autoStarted.current = true;
    void runExtract(initialUrl);
  }, [initialUrl, runExtract]);

  function cancelExtract() {
    cancelRef.current = true;
    abortRef.current?.abort();
  }

  function startOver() {
    const submissionId = newSubmissionId();
    submissionRef.current = submissionId;
    setDraft({
      ...createDraftDefaults(submissionId),
      note: starterIdea?.note ?? "",
    });
    setCandidates([]);
    setSelectedImage(null);
    setPartial(false);
    setFailed(false);
    setStep("input");
  }

  function updateField(field: keyof CreateDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  if (step === "loading") {
    return (
      <div className={ENTRY_COLUMN}>
        <AddLoading host={host} onCancel={cancelExtract} />
      </div>
    );
  }

  if (step === "review" || step === "manual") {
    const reviewPhase = step === "review" ? "extracted" : "manual";
    return (
      <div className={WIDE_COLUMN}>
        {step === "review" ? (
          <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Found it. Look right?
          </h1>
        ) : (
          <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            {failed ? "That link played hard to get." : "Add it manually"}
          </h1>
        )}
        <ExtractReviewForm
          draft={draft}
          candidates={candidates}
          selectedImage={selectedImage}
          onSelectImage={setSelectedImage}
          partial={partial}
          failed={failed}
          reviewPhase={reviewPhase}
          formAction={formAction}
          pending={pending}
          actionState={actionState}
          onStartOver={startOver}
          // The re-extract affordance belongs to review and to the failed
          // fallback's retry; deliberate manual entry offers none.
          onRetryExtract={
            step === "review" || failed
              ? () => {
                  setLink(draft.sourceUrl);
                  void runExtract(draft.sourceUrl, draft);
                }
              : undefined
          }
          onFieldChange={updateField}
        />
      </div>
    );
  }

  return (
    <div className={`${ENTRY_COLUMN} flex flex-col gap-6`}>
      {starterIdea && (
        <aside className="rounded-2xl border-2 border-outline-strong bg-accent-highlight-soft p-4">
          <p className="font-bold">{starterIdea.label}</p>
          <p className="mt-1 text-sm text-content-secondary">
            {starterIdea.prompt}
          </p>
        </aside>
      )}
      <InitialEntry
        link={link}
        linkError={linkError}
        onLinkChange={(value) => {
          setLink(value);
          setLinkError(null);
        }}
        onPaste={async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (text) {
              setLink(text);
              setLinkError(null);
            }
          } catch {
            // Clipboard access denied: the labelled field remains fully
            // usable; nothing is invented and no error is surfaced.
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void runExtract(link);
        }}
        onStartManual={() => enterManual(link.trim(), undefined, false)}
      />
    </div>
  );
}

function InitialEntry({
  link,
  linkError,
  onLinkChange,
  onPaste,
  onSubmit,
  onStartManual,
}: {
  link: string;
  linkError: string | null;
  onLinkChange: (value: string) => void;
  onPaste: () => Promise<void>;
  onSubmit: (event: React.FormEvent) => void;
  onStartManual: () => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-display-md font-extrabold leading-[1.02] tracking-tight sm:text-4xl">
          Drop the link. We’ll do the nosy part.
        </h1>
        <p className="mt-3 text-lg text-content-secondary">
          We’ll pull the name, photos and price. You add the personality.
        </p>
      </div>
      <div>
        <label htmlFor="product-link" className="text-sm font-bold">
          Product link
        </label>
        <div
          className={`mt-1.5 flex items-center gap-2 rounded-surface border-2 bg-surface-raised pl-4 pr-1.5 focus-within:shadow-chunk ${
            linkError ? "border-feedback-error" : "border-outline-strong"
          }`}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0 text-content-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <input
            id="product-link"
            name="productLink"
            type="url"
            inputMode="url"
            autoFocus
            value={link}
            onChange={(event) => onLinkChange(event.target.value)}
            placeholder="https://"
            aria-invalid={linkError !== null}
            aria-describedby={linkError ? "link-error" : "link-help"}
            className="h-14 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-content-muted"
          />
          <button
            type="button"
            onClick={() => void onPaste()}
            className="inline-flex h-11 min-h-touch-min shrink-0 items-center gap-1.5 rounded-surface-sm bg-surface-sunken px-3 text-sm font-bold transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="8" height="4" x="8" y="2" rx="1" />
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            </svg>
            Paste
          </button>
        </div>
        {linkError ? (
          <p
            id="link-error"
            className="mt-2 text-sm font-semibold text-feedback-error"
          >
            {linkError}
          </p>
        ) : (
          <p id="link-help" className="mt-2 text-sm text-content-muted">
            Works with Amazon, Myntra, Nykaa, Etsy, Uniqlo and most shops.
          </p>
        )}
      </div>
      <button
        type="submit"
        className="inline-flex h-14 min-h-touch-min items-center justify-center gap-2 rounded-surface border-2 border-outline-strong bg-action-primary text-lg font-bold shadow-chunk transition-transform ease-snap active:translate-x-0.5 active:translate-y-0.5 active:shadow-none motion-reduce:transition-none motion-reduce:active:translate-x-0 motion-reduce:active:translate-y-0"
      >
        Fetch details
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onStartManual}
        className="inline-flex h-12 min-h-touch-min items-center justify-center gap-2 font-bold underline-offset-4 hover:underline"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        No link? Add it manually
      </button>
    </form>
  );
}

const LOADING_STEPS = [
  "Peeking at the page",
  "Grabbing the good photos",
  "Doing the currency maths",
] as const;

/**
 * The bounded extracting composition (V18 AddLoading): the host line,
 * the step list, the skeleton, and Cancel. Reduced motion replaces the
 * spinner and pulse with static equivalents without removing the state
 * information (the step list itself).
 */
export function AddLoading({
  host,
  onCancel,
}: {
  host: string;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const first = window.setTimeout(() => setStep(1), 650);
    const second = window.setTimeout(() => setStep(2), 1300);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, []);

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-display-md font-extrabold leading-[1.02] tracking-tight sm:text-4xl">
          Being nosy…
        </h1>
        <p className="mt-2 truncate text-content-secondary">Reading {host}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {LOADING_STEPS.map((label, index) => {
          const done = index < step;
          const active = index === step;
          return (
            <li
              key={label}
              className="flex items-center gap-3 text-lg font-semibold"
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-outline-strong ${
                  done ? "bg-content-primary" : "bg-surface-raised"
                }`}
              >
                {done ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4 text-surface-page"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : active ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : null}
              </span>
              {label}
            </li>
          );
        })}
      </ol>
      <div
        aria-hidden="true"
        className="flex gap-4 rounded-surface-lg border-2 border-outline-strong/15 bg-surface-raised p-4"
      >
        <div className="h-28 w-24 shrink-0 animate-pulse rounded-surface bg-surface-sunken motion-reduce:animate-none" />
        <div className="flex flex-1 flex-col gap-2.5 pt-1">
          <div className="h-4 w-4/5 animate-pulse rounded-full bg-surface-sunken motion-reduce:animate-none" />
          <div className="h-4 w-1/2 animate-pulse rounded-full bg-surface-sunken motion-reduce:animate-none" />
          <div className="mt-auto h-4 w-1/3 animate-pulse rounded-full bg-surface-sunken motion-reduce:animate-none" />
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="h-12 min-h-touch-min self-start rounded-surface-sm px-2 font-bold underline-offset-4 hover:underline"
      >
        Cancel
      </button>
    </div>
  );
}
