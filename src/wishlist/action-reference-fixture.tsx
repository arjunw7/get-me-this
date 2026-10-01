"use client";

import { useActionState } from "react";

import {
  createItemAction,
  deleteItemAction,
  editItemAction,
} from "./item-actions";

const syntheticId = "00000000-0000-4000-8000-000000000028";

export function WishlistActionReferenceFixture() {
  const [create, createForm, createPending] = useActionState(createItemAction, {
    status: "idle" as const,
  });
  const [edit, editForm, editPending] = useActionState(
    editItemAction.bind(null, syntheticId),
    { status: "idle" as const },
  );
  const [remove, deleteForm, deletePending] = useActionState(
    deleteItemAction.bind(null, syntheticId),
    { status: "idle" as const },
  );
  return (
    <main
      data-no-provider-config="true"
      className="mx-auto max-w-xl space-y-6 p-8"
    >
      <h1>Action reference fixture</h1>
      <p>
        {create.status} {edit.status} {remove.status}
      </p>
      <form action={createForm}>
        <input name="title" value="" readOnly />
        <button name="submit" value="create" disabled={createPending}>
          Create action
        </button>
      </form>
      <form action={editForm}>
        <input name="title" value="" readOnly />
        <button name="submit" value="edit" disabled={editPending}>
          Edit action
        </button>
      </form>
      <form action={deleteForm}>
        <button name="submit" value="delete" disabled={deletePending}>
          Delete action
        </button>
      </form>
    </main>
  );
}
