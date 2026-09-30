"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import {
  createItemAction,
  editItemAction,
  type ItemActionState,
} from "./item-actions";
import { createDraftDefaults } from "./item-drafts";
import { DeleteDialog } from "./delete-dialog";
import { DeleteErrorBoundary } from "./delete-error-boundary";
import type { CreateDraft, EditDraft } from "./item-input";
import { SUPPORTED_CURRENCY_CODES } from "./currency-metadata";
import type { EditItem } from "./item-write";

const INITIAL: ItemActionState = { status: "idle" };
const QUICK_CURRENCIES = ["INR", "USD", "GBP", "EUR"];
const DESIRE_CHOICES = [
  ["really_want", "Really want"],
  ["would_love", "Would love"],
  ["just_an_idea", "Just an idea"],
] as const;
const fieldClass = "mt-1 min-h-touch-min w-full rounded-surface border-2 border-outline-strong bg-surface-raised px-3 text-content-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary-strong";
const labelClass = "block text-sm font-bold text-content-primary";

export function ItemForm({
  mode,
  itemId,
  item,
  initialDraft,
}: {
  mode: "create" | "edit";
  itemId?: string;
  item?: EditItem;
  initialDraft?: CreateDraft | EditDraft;
}) {
  const action = mode === "create" ? createItemAction : editItemAction.bind(null, itemId ?? "");
  const [state, formAction, pending] = useActionState(action as never, INITIAL);
  const defaults = initialDraft ?? (mode === "create" ? createDraftDefaults(crypto.randomUUID()) : {
    title: item?.title ?? "", sourceUrl: item?.source_url ?? "", retailer: item?.retailer ?? "", amount: "", currency: "INR", note: item?.note ?? "", desireLevel: item?.desire_level ?? "would_love", priceIntent: "clear",
  });
  return <ItemFormFields key={state.draft ? JSON.stringify(state.draft) : "initial"} mode={mode} item={item} initialDraft={state.draft ?? defaults} formAction={formAction} pending={pending} state={state} />;
}

function ItemFormFields({ mode, item, initialDraft, formAction, pending, state }: {
  mode: "create" | "edit";
  item?: EditItem;
  initialDraft: CreateDraft | EditDraft;
  formAction: (data: FormData) => void;
  pending: boolean;
  state: ItemActionState;
}) {
  const [draft, setDraft] = useState<CreateDraft | EditDraft>(initialDraft);
  const stateMatchesDraft = !state.draft || JSON.stringify(state.draft) === JSON.stringify(draft);
  const errors = stateMatchesDraft ? state.errors ?? {} : {};

  function update(field: keyof CreateDraft | keyof EditDraft, value: string) {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (mode === "edit" && "priceIntent" in next && (field === "amount" || field === "currency")) {
        const editable = next as EditDraft;
        if (editable.priceIntent !== "preserve") editable.priceIntent = editable.amount.trim() ? "replace" : "clear";
      }
      return next;
    });
  }

  function startOver() {
    setDraft(createDraftDefaults(crypto.randomUUID()));
  }

  const opaquePreserve = mode === "edit" && "priceIntent" in draft && draft.priceIntent === "preserve";
  const statusCopy = !stateMatchesDraft ? null : state.status === "unavailable" ? "We couldn’t save that item just now. Your details are still here; try again." :
    state.status === "retry" ? "This item changed while you were editing. Reload the item before trying again." :
      state.status === "submission-conflict" ? "This entry couldn’t be confirmed. Start over and try again." : null;

  return (
    <>
    <form action={formAction} className="mx-auto w-full max-w-2xl space-y-6 pb-28 sm:pb-12">
      <div>
        <h1 className="font-display text-display-sm font-extrabold tracking-tight">{mode === "create" ? "Add an item" : "Edit item"}</h1>
        <p className="mt-2 text-content-secondary">Add the details you want your friends to see.</p>
      </div>
      {statusCopy ? <p role="alert" className="rounded-surface border-2 border-outline-strong bg-surface-raised p-3">{statusCopy}</p> : null}
      <label className={labelClass}>Item name
        <input className={fieldClass} name="title" value={draft.title} onChange={(event) => update("title", event.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "title-error" : undefined} />
      </label>
      {errors.title ? <p id="title-error" className="text-sm text-feedback-error">{errors.title}</p> : null}
      <label className={labelClass}>Shop (optional)
        <input className={fieldClass} name="retailer" value={draft.retailer} onChange={(event) => update("retailer", event.target.value)} aria-invalid={Boolean(errors.retailer)} aria-describedby={errors.retailer ? "retailer-error" : undefined} />
      </label>
      {errors.retailer ? <p id="retailer-error" className="text-sm text-feedback-error">{errors.retailer}</p> : null}
      <fieldset className="space-y-2">
        <legend className={labelClass}>Price (optional)</legend>
        {mode === "edit" && item?.original_currency && !SUPPORTED_CURRENCY_CODES.includes(item.original_currency) ? (
          <p className="text-sm text-content-secondary">Stored price: {item.original_amount_minor} {item.original_currency} — price display unavailable.</p>
        ) : null}
        {opaquePreserve ? <p className="text-sm text-content-secondary">This stored price will stay unchanged unless you choose Clear or Replace.</p> : null}
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <label className="sr-only" htmlFor="item-price">Price</label>
          <input id="item-price" className={fieldClass} name="amount" inputMode="decimal" value={draft.amount} disabled={opaquePreserve} onChange={(event) => update("amount", event.target.value)} aria-invalid={Boolean(errors.amount)} aria-describedby={errors.amount ? "amount-error" : undefined} />
          <label className="sr-only" htmlFor="item-currency">Currency</label>
          <select id="item-currency" className={fieldClass} name="currency" value={draft.currency} disabled={opaquePreserve} onChange={(event) => update("currency", event.target.value)}>
            {Array.from(new Set([...QUICK_CURRENCIES, ...SUPPORTED_CURRENCY_CODES])).map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
        </div>
        {errors.amount ? <p id="amount-error" className="text-sm text-feedback-error">{errors.amount}</p> : null}
        {mode === "edit" ? <input type="hidden" name="priceIntent" value={(draft as EditDraft).priceIntent} /> : null}
        {mode === "edit" && opaquePreserve ? <div className="flex gap-3">
          <button type="button" className="min-h-touch-min rounded-surface border-2 border-outline-strong px-4 font-bold" onClick={() => setDraft({ ...draft, amount: "", priceIntent: "clear" } as EditDraft)}>Clear price</button>
          <button type="button" className="min-h-touch-min rounded-surface border-2 border-outline-strong px-4 font-bold" onClick={() => setDraft({ ...draft, amount: "", currency: "INR", priceIntent: "replace" } as EditDraft)}>Replace price</button>
        </div> : null}
      </fieldset>
      <label className={labelClass}>Link (optional)
        <input className={fieldClass} name="sourceUrl" type="url" value={draft.sourceUrl} onChange={(event) => update("sourceUrl", event.target.value)} aria-invalid={Boolean(errors.sourceUrl)} aria-describedby={errors.sourceUrl ? "sourceUrl-error" : undefined} />
      </label>
      {errors.sourceUrl ? <p id="sourceUrl-error" className="text-sm text-feedback-error">{errors.sourceUrl}</p> : null}
      <label className={labelClass}>Note (optional)
        <textarea className={`${fieldClass} min-h-28 py-2`} name="note" value={draft.note} onChange={(event) => update("note", event.target.value)} aria-invalid={Boolean(errors.note)} aria-describedby={errors.note ? "note-error" : undefined} />
      </label>
      {errors.note ? <p id="note-error" className="text-sm text-feedback-error">{errors.note}</p> : null}
      <fieldset>
        <legend className={labelClass}>How much do you want it?</legend>
        <div className="mt-2 flex flex-wrap gap-3">{DESIRE_CHOICES.map(([value, label]) => <label key={value} className="inline-flex min-h-touch-min items-center gap-2 rounded-surface border-2 border-outline-strong px-3"><input type="radio" name="desireLevel" value={value} checked={draft.desireLevel === value} onChange={(event) => update("desireLevel", event.target.value)} />{label}</label>)}</div>
      </fieldset>
      {mode === "create" ? <input type="hidden" name="submissionId" value={(draft as CreateDraft).submissionId} /> : null}
      {errors.submissionId ? <p role="alert" className="text-sm text-feedback-error">{errors.submissionId}</p> : null}
      <div aria-hidden="true" className="rounded-surface border-2 border-dashed border-outline-strong/35 bg-surface-sunken p-5 text-center text-content-muted">Photo preview — adding photos isn’t available yet.</div>
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t-2 border-outline-strong bg-surface-page/95 p-4 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Link href="/wishlist" className="inline-flex min-h-touch-min flex-1 items-center justify-center rounded-surface border-2 border-outline-strong bg-surface-raised px-4 font-bold">Cancel</Link>
        <button type="submit" disabled={pending} className="min-h-touch-min flex-1 rounded-surface border-2 border-outline-strong bg-action-primary px-4 font-bold shadow-chunk disabled:opacity-60">{pending ? "Saving…" : mode === "create" ? "Add item" : "Save changes"}</button>
      </div>
      {mode === "create" ? <button type="button" onClick={startOver} className="min-h-touch-min font-bold underline underline-offset-4">Start over</button> : null}
    </form>
    {mode === "edit" && item ? <DeleteErrorBoundary itemId={item.id}><DeleteDialog itemId={item.id} title={item.title} /></DeleteErrorBoundary> : null}
    </>
  );
}
