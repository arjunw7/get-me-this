import Link from "next/link";

import { Wordmark } from "@/src/landing/wordmark";
import { readCoordinatorCookie } from "@/src/invite/flow-session";
import { AccountMenu } from "@/src/home/account-menu";

/**
 * The application shell header for the wishlist routes (005b): the same
 * shell as /home — the wordmark and the account-menu trigger — so the
 * routes sit inside the approved application shell rather than as bare
 * documents.
 */
export async function WishlistShellHeader({
  email,
  displayName,
}: {
  email: string | null;
  displayName: string;
}) {
  // Brief 006c criterion 12: a live invitation coordinator makes this
  // browser's logout brokered (origin-wide Web Lock + server lease).
  const coordinator = await readCoordinatorCookie();
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
      <Link
        href="/home"
        aria-label="Get Me This home"
        className="inline-flex min-h-touch-min items-center"
      >
        <Wordmark className="text-2xl sm:text-3xl" />
      </Link>
      <AccountMenu
        email={email}
        displayName={displayName}
        brokered={coordinator !== null}
      />
    </header>
  );
}
