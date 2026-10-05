"use client";
import Link, { useLinkStatus } from "next/link";
import { buttonClassName } from "@/src/ui/styles";

export function InviteRecoveryLink({ href }: { href: "/" | "/home" }) {
  return (
    <Link
      href={href}
      prefetch
      className={`${buttonClassName({ variant: "secondary", size: "lg" })} cursor-pointer`}
    >
      <RecoveryLabel />
    </Link>
  );
}
function RecoveryLabel() {
  const { pending } = useLinkStatus();
  return (
    <span role="status" aria-live="polite">
      {pending ? "Opening…" : "Back to Get Me This"}
    </span>
  );
}
