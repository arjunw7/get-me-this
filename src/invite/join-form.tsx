"use client";

import { useFormStatus } from "react-dom";

import { buttonClassName } from "@/src/ui/styles";

/**
 * The Join control (brief 006c): pending duplicate activation is resisted
 * by disabling while the POST is in flight, but database correctness never
 * depends on the disabled state — the database function is idempotent and
 * the replay is write-free.
 */
export function JoinForm({
  action,
  flowId,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly flowId: string;
}) {
  return (
    <form action={action} className="mt-8">
      <input type="hidden" name="flowId" value={flowId} />
      <JoinButton />
    </form>
  );
}

function JoinButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClassName({ variant: "primary", size: "lg" })} w-full sm:w-auto`}
    >
      {pending ? "Joining…" : "Join the group"}
    </button>
  );
}
