"use client";

import {
  useEffect,
  useRef,
  useState,
  useActionState,
  startTransition,
} from "react";
import Link from "next/link";

import { Button } from "@/src/ui/button";
import { TextField } from "@/src/ui/text-field";
import { DateField } from "@/src/ui/date-field";
import { CurrencySelect } from "@/src/wishlist/currency-select";

import type { CreateGroupActionState } from "./action-state";
import { canonicalPayloadDigest } from "./canonical";
import {
  bindDraftToDigest,
  loadDraftBinding,
  loadOrCreateDraftKey,
  rotateDraftKey,
} from "./draft-key";
import {
  GIFTING_MODES,
  OCCASIONS,
  SELECTABLE_CURRENCIES,
  type GiftingMode,
  type OccasionType,
  type SelectableCurrency,
} from "./occasions";
import {
  resolveBrowserTimeZone,
  validateGroupForm,
  type GroupFieldErrors,
} from "./validation";

/**
 * The frozen Version 18 `CreateGroup` screen (brief 006b), backed by the
 * receipt-backed Server Action.
 *
 * Idempotency surface: the draft owns one UUIDv4 request key; the first
 * server submission binds it to the attempted canonical payload digest in
 * session storage. A changed payload after a submitted attempt surfaces the
 * idempotency conflict BEFORE the changed payload is sent; only the explicit
 * confirmed action rotates the key.
 */

const CLOSE_RETURN_ROUTE = "/home";

const chipBase =
  "inline-flex min-h-touch-min items-center rounded-pill border-2 px-4 text-label font-bold transition-colors duration-[var(--duration-press)] ease-snap";
const chipIdle =
  "border-outline-subtle bg-surface-raised hover:border-outline-strong";
const chipActive = "border-outline-strong bg-outline-strong text-surface-page";

const modeIdle =
  "border-outline-subtle bg-surface-raised hover:border-outline-strong";
const modeActive =
  "border-outline-strong bg-accent-highlight-soft shadow-chunk-sm";

export interface CreateGroupScreenProps {
  readonly initialName?: string;
  readonly initialOccasion?: OccasionType;
  readonly action: (
    previous: CreateGroupActionState,
    data: FormData,
  ) => Promise<CreateGroupActionState>;
}

export function CreateGroupScreen({
  action,
  initialName = "",
  initialOccasion = "birthday",
}: CreateGroupScreenProps) {
  const [state, formAction, isPending] = useActionState(action, {
    status: "idle",
  } satisfies CreateGroupActionState);
  const [name, setName] = useState(initialName);
  const [occasion, setOccasion] = useState<OccasionType>(initialOccasion);
  const [date, setDate] = useState("");
  const [budget, setBudget] = useState("2500");
  const [currency, setCurrency] = useState<SelectableCurrency>("INR");
  const [mode, setMode] = useState<GiftingMode>("secret_draw");
  const [touched, setTouched] = useState(false);
  const [clientErrors, setClientErrors] = useState<GroupFieldErrors>({});
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [timeZoneMissing, setTimeZoneMissing] = useState(false);
  const [conflict, setConflict] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Focus the error summary after a rejected submit.
  useEffect(() => {
    if (state.status === "invalid" || state.status === "unavailable") {
      summaryRef.current?.focus();
    }
  }, [state]);

  const pending = isPending;

  const serverErrors: GroupFieldErrors =
    state.status === "invalid" ? state.errors : {};
  const errors: GroupFieldErrors = { ...clientErrors, ...serverErrors };
  const hasErrors = Object.keys(errors).length > 0;

  async function attemptSubmit(explicitKey?: string): Promise<void> {
    if (!formRef.current) return;
    const form = formRef.current;

    // The browser-resolved IANA zone is a required input, resolved at submit
    // time (event context). It is never substituted with the server zone or
    // UTC; missing or invalid data is a form error.
    const timeZone = resolveBrowserTimeZone();
    setTimeZoneMissing(timeZone === null);
    if (timeZone === null) return;
    const activeKey = explicitKey
      ? { ok: true as const, key: explicitKey }
      : loadOrCreateDraftKey();
    if (!activeKey.ok) {
      setStorageUnavailable(true);
      return;
    }

    const fields = {
      name,
      occasionType: occasion,
      occasionDate: date,
      timeZone: timeZone ?? "",
      budgetAmount: budget,
      budgetCurrency: currency,
      mode,
    };
    const validation = validateGroupForm(fields);
    setTouched(true);
    if (!validation.ok) {
      setClientErrors(validation.errors);
      summaryRef.current?.focus();
      return;
    }
    setClientErrors({});

    // Bind the draft key to the attempted canonical payload digest before
    // the first server submission. Client-only validation never binds it.
    const digest = await canonicalPayloadDigest(validation.payload);
    const binding = loadDraftBinding();
    if (binding && binding.digest !== digest) {
      // Surface the conflict before sending the changed payload.
      setConflict(true);
      return;
    }
    if (!binding) {
      if (!bindDraftToDigest(activeKey.key, digest)) {
        setStorageUnavailable(true);
        return;
      }
    }

    const data = new FormData(form);
    data.set("requestKey", activeKey.key);
    data.set("name", fields.name);
    data.set("occasionType", fields.occasionType);
    data.set("occasionDate", fields.occasionDate);
    data.set("timeZone", fields.timeZone);
    data.set("budgetAmount", fields.budgetAmount);
    data.set("budgetCurrency", fields.budgetCurrency);
    data.set("mode", fields.mode);

    startTransition(() => {
      formAction(data);
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void attemptSubmit();
  }

  /** The explicit confirmed path: a replacement key bound to the changed payload. */
  async function confirmSubmitAsNewRequest(): Promise<void> {
    const rotated = rotateDraftKey();
    if (!rotated.ok) {
      setStorageUnavailable(true);
      return;
    }
    setConflict(false);
    // The replacement request starts unbound; attemptSubmit binds the changed
    // digest to the new key and submits it.
    await attemptSubmit(rotated.key);
  }

  const conflictVisible = conflict || state.status === "conflict";

  return (
    <div className="min-h-screen w-full bg-surface-page text-content-primary">
      <header className="sticky top-0 z-20 border-b-2 border-outline-strong bg-surface-page">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-gutter">
          <p className="font-display text-lg font-extrabold">Create a group</p>
          <Link
            href={CLOSE_RETURN_ROUTE}
            aria-label="Close"
            className="inline-flex h-11 w-11 items-center justify-center rounded-pill border-2 border-outline-strong bg-surface-raised hover:bg-surface-sunken"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-gutter py-8 sm:py-12">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-7"
        >
          <div>
            <h1 className="font-display text-display-lg leading-[1.02] tracking-tight">
              What are we celebrating?
            </h1>
            <p className="mt-3 text-lg text-content-secondary">
              You can change any of this later.
            </p>
          </div>

          <TextField
            id="group-name"
            label="Group name"
            name="name"
            placeholder="e.g. Rohan turns 27"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={errors.name}
            maxLength={120}
          />

          <fieldset>
            <legend className="text-label font-bold font-display">
              Occasion
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {OCCASIONS.map((occasionOption) => (
                <label key={occasionOption.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="occasionType"
                    value={occasionOption.value}
                    checked={occasion === occasionOption.value}
                    onChange={() => setOccasion(occasionOption.value)}
                    className="peer sr-only"
                  />
                  <span
                    className={`${chipBase} peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-info ${
                      occasion === occasionOption.value ? chipActive : chipIdle
                    }`}
                  >
                    {occasionOption.label}
                  </span>
                </label>
              ))}
            </div>
            {errors.occasion ? (
              <p className="mt-1 text-caption font-bold text-feedback-error">
                {errors.occasion}
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <DateField
              id="group-date"
              label="Date"
              name="occasionDate"
              value={date}
              onChange={setDate}
              error={errors.date}
            />
            <div className="flex flex-col gap-1.5">
              <span
                id="budget-label"
                className="font-display text-label font-bold"
              >
                Budget per person
              </span>
              <div
                className="flex gap-2"
                role="group"
                aria-labelledby="budget-label"
              >
                <CurrencySelect
                  id="group-currency"
                  name="budgetCurrency"
                  value={currency}
                  codes={SELECTABLE_CURRENCIES}
                  onChange={(code) => setCurrency(code as SelectableCurrency)}
                  className="w-28 shrink-0"
                />
                <input
                  name="budgetAmount"
                  inputMode="decimal"
                  autoComplete="off"
                  aria-label="Amount"
                  aria-invalid={errors.budget ? true : undefined}
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                  className="h-control-md w-full min-w-0 rounded-control border-2 border-outline-strong bg-surface-raised px-3.5 text-body tabular-nums outline-none focus:shadow-chunk-sm"
                />
              </div>
              {errors.budget ? (
                <p className="text-caption font-bold text-feedback-error">
                  {errors.budget}
                </p>
              ) : null}
            </div>
          </div>

          <fieldset>
            <legend className="text-label font-bold font-display">
              How should people gift?
            </legend>
            <div className="mt-2 flex flex-col gap-2">
              {GIFTING_MODES.map((modeOption) => (
                <label
                  key={modeOption.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-surface-lg border-2 p-4 transition-colors duration-[var(--duration-press)] ease-snap ${
                    mode === modeOption.value ? modeActive : modeIdle
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={modeOption.value}
                    checked={mode === modeOption.value}
                    onChange={() => setMode(modeOption.value)}
                    className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-outline-strong)]"
                  />
                  <span>
                    <span className="block font-display text-lg font-bold">
                      {modeOption.name}
                    </span>
                    <span className="block text-label text-content-secondary">
                      {modeOption.short}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-caption text-content-muted">
              In every style, reservations stay invisible to the person
              receiving.
            </p>
            {errors.mode ? (
              <p className="mt-1 text-caption font-bold text-feedback-error">
                {errors.mode}
              </p>
            ) : null}
          </fieldset>

          <div
            ref={summaryRef}
            role="alert"
            tabIndex={-1}
            className="outline-none"
            aria-live="assertive"
          >
            {hasErrors && (state.status === "invalid" || touched) ? (
              <div className="rounded-surface border-2 border-feedback-error bg-feedback-error-soft p-4 text-label font-bold text-feedback-error">
                Fix the highlighted fields and try again.
              </div>
            ) : null}
            {timeZoneMissing ? (
              <div className="mt-2 rounded-surface border-2 border-feedback-error bg-feedback-error-soft p-4 text-label font-bold text-feedback-error">
                Your device time zone could not be determined, so the date
                cannot be saved reliably.
              </div>
            ) : null}
            {storageUnavailable ? (
              <div className="mt-2 rounded-surface border-2 border-feedback-error bg-feedback-error-soft p-4 text-label font-bold text-feedback-error">
                This browser session cannot safely remember an unfinished group
                creation. Reopen this page from a normal browser window and try
                again.
              </div>
            ) : null}
            {state.status === "unavailable" ? (
              <div className="mt-2 rounded-surface border-2 border-feedback-error bg-feedback-error-soft p-4 text-label font-bold text-feedback-error">
                Group creation is unavailable right now. Nothing was created.
              </div>
            ) : null}
            {state.status === "retry" ? (
              <div className="mt-2 rounded-surface border-2 border-outline-strong bg-surface-raised p-4">
                <p className="text-label font-bold">
                  We could not confirm whether your group was created.
                </p>
                <p className="mt-1 text-caption text-content-secondary">
                  Trying again with the same details is safe: an already-created
                  group is returned, never duplicated.
                </p>
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void attemptSubmit();
                    }}
                    disabled={pending}
                  >
                    Try again
                  </Button>
                </div>
              </div>
            ) : null}
            {conflictVisible ? (
              <div
                className="mt-2 rounded-surface border-2 border-outline-strong bg-accent-highlight-soft p-4"
                data-testid="idempotency-conflict"
              >
                <p className="text-label font-bold">
                  This form changed after your earlier attempt.
                </p>
                <p className="mt-1 text-caption text-content-secondary">
                  Keep your earlier attempt, or send the changed details as a
                  new request.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void confirmSubmitAsNewRequest();
                    }}
                    disabled={pending}
                  >
                    Submit changes as a new request
                  </Button>
                  <Button
                    variant="subtle"
                    onClick={() => {
                      setConflict(false);
                    }}
                    disabled={pending}
                  >
                    Keep my earlier attempt
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={pending || storageUnavailable}
          >
            {pending ? "Creating…" : "Create group"}
          </Button>
        </form>
      </main>
    </div>
  );
}
