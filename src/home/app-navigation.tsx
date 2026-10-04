"use client";
import type { Vibe } from "@/src/profile/vibe";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/src/landing/wordmark";
import { AccountMenu } from "./account-menu";
import { AppIcon } from "./app-icon";
const destinations = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/groups", label: "Groups", icon: "groups" },
  { href: "/wishlist", label: "My wishlist", icon: "wishlist" },
] as const;
export function AppNavigation({
  email,
  displayName,
  tasteLine,
  vibe,
  brokered,
  showMobileAdd = true,
  loading = false,
}: {
  email: string | null;
  displayName: string;
  tasteLine?: string | null;
  vibe?: Vibe;
  brokered: boolean;
  showMobileAdd?: boolean;
  loading?: boolean;
}) {
  const pathname = usePathname();
  const editing = pathname.startsWith("/wishlist/items/");
  const account = { email, displayName, tasteLine, vibe, brokered };
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r-2 border-outline-strong bg-surface-page px-5 py-6 lg:flex">
        <Link
          href="/home"
          aria-label="Get Me This home"
          className="inline-flex min-h-11 items-center rounded-control px-2 py-1"
        >
          <Wordmark className="text-[26px]" />
        </Link>
        <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
          {destinations.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
              className={`flex h-12 items-center gap-3 rounded-surface px-3 text-sm font-bold ${pathname.startsWith(href) ? "bg-content-primary text-surface-page" : "hover:bg-surface-sunken"}`}
            >
              <AppIcon name={icon} />
              {label}
            </Link>
          ))}
        </nav>
        <Link
          href="/wishlist/items/new"
          className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-surface border-2 border-outline-strong bg-action-primary font-bold shadow-chunk transition-transform hover:-translate-y-0.5"
        >
          <AppIcon name="plus" />
          Add an item
        </Link>
        <div className="mt-auto pt-8">
          {loading ? (
            <div
              aria-hidden="true"
              className="h-12 animate-pulse rounded-surface bg-surface-sunken motion-reduce:animate-none"
            />
          ) : (
            <AccountMenu {...account} variant="sidebar" />
          )}
        </div>
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b-2 border-outline-strong bg-surface-page px-4 lg:hidden">
        <Link
          href="/home"
          aria-label="Get Me This home"
          className="inline-flex min-h-11 items-center"
        >
          <Wordmark className="text-xl" />
        </Link>
        {loading ? (
          <div
            aria-hidden="true"
            className="h-8 w-8 animate-pulse rounded-full bg-surface-sunken motion-reduce:animate-none"
          />
        ) : (
          <AccountMenu {...account} variant="topbar" />
        )}
      </header>
      {!editing && showMobileAdd && (
        <Link
          href="/wishlist/items/new"
          className="fixed right-4 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 inline-flex h-14 items-center gap-2 rounded-pill border-2 border-outline-strong bg-action-primary pl-4 pr-5 font-bold shadow-chunk lg:hidden"
        >
          <AppIcon name="plus" />
          Add an item
        </Link>
      )}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-outline-strong bg-surface-page pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid h-[68px] max-w-md grid-cols-3">
          {destinations.map(({ href, label, icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={pathname.startsWith(href) ? "page" : undefined}
                className="flex h-full flex-col items-center justify-center gap-1 text-xs font-semibold"
              >
                <span
                  className={`inline-flex h-8 w-14 items-center justify-center rounded-pill ${pathname.startsWith(href) ? "bg-content-primary text-surface-page" : "text-content-secondary"}`}
                >
                  <AppIcon name={icon} />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
