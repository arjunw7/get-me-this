import Link from "next/link";
import type { ReactNode, Ref } from "react";

import { textLinkClassName } from "./styles";

export type TextLinkProps = {
  href: string;
  children: ReactNode;
  /** External links open in a new tab and say so to assistive technology. */
  external?: boolean;
  ref?: Ref<HTMLAnchorElement>;
};

export function TextLink({
  href,
  children,
  external = false,
  ref,
}: TextLinkProps) {
  if (external) {
    return (
      <a
        ref={ref}
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={textLinkClassName()}
      >
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }

  return (
    <Link ref={ref} href={href} className={textLinkClassName()}>
      {children}
    </Link>
  );
}
