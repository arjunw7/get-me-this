import Link from "next/link";
import type { ReactNode } from "react";

import {
  buttonClassName,
  type ButtonSize,
  type ButtonVariant,
} from "@/src/ui/styles";

/**
 * Link styled with the token-pure button classes, for the landing's
 * call-to-action navigation. Keeps the approved chunky-button look without
 * duplicating styles or adding a dependency.
 */
export function CtaLink({
  href,
  variant = "primary",
  size = "lg",
  className = "",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`${buttonClassName({ variant, size })} ${className}`}
    >
      {children}
    </Link>
  );
}
