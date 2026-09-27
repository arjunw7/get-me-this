import React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { HouseIcon, LayoutGridIcon, PlusIcon, UsersRoundIcon } from 'lucide-react';
import { AccountMenu } from './AccountMenu';
import { Wordmark } from './Wordmark';
const NAV = [{
  to: '/home',
  label: 'Home',
  icon: HouseIcon,
  match: '/home'
}, {
  to: '/groups',
  label: 'Groups',
  icon: UsersRoundIcon,
  match: '/groups'
}, {
  to: '/wishlist',
  label: 'My wishlist',
  icon: LayoutGridIcon,
  match: '/wishlist'
}];
export function AppShell() {
  const {
    pathname
  } = useLocation();
  return <div className="min-h-screen w-full bg-paper text-ink">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r-2 border-ink bg-paper px-5 py-6 lg:flex">
        <Link to="/" className="rounded-lg px-2 py-1" aria-label="Get Me This home">
          <Wordmark className="text-[26px]" />
        </Link>
        <nav aria-label="Main" className="mt-10 flex flex-col gap-1">
          {NAV.map(({
          to,
          label,
          icon: Icon,
          match
        }) => {
          const active = pathname.startsWith(match);
          return <NavLink key={to} to={to} aria-current={active ? 'page' : undefined} className={`flex h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-semibold transition-colors duration-150 ${active ? 'bg-ink text-paper' : 'text-ink hover:bg-cream'}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </NavLink>;
        })}
        </nav>
        <Link to="/add" className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-coral font-bold text-ink shadow-chunk transition-transform duration-150 ease-snap hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
          <PlusIcon className="h-5 w-5" aria-hidden="true" />
          Add an item
        </Link>
        <AccountMenu variant="sidebar" />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b-2 border-ink bg-paper px-4 lg:hidden">
        <Link to="/" aria-label="Get Me This home">
          <Wordmark className="text-xl" />
        </Link>
        <AccountMenu variant="topbar" />
      </header>

      <main className="pb-40 lg:pb-16 lg:pl-64">
        <Outlet />
      </main>

      {/* Mobile persistent add action */}
      <Link to="/add" className="fixed bottom-[84px] right-4 z-30 inline-flex h-14 items-center gap-2 rounded-full border-2 border-ink bg-coral pl-4 pr-5 font-bold text-ink shadow-chunk transition-transform duration-150 ease-snap active:translate-x-0.5 active:translate-y-0.5 active:shadow-none lg:hidden">
        <PlusIcon className="h-5 w-5" aria-hidden="true" />
        Add an item
      </Link>

      {/* Mobile bottom nav */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto grid h-[68px] max-w-md grid-cols-3">
          {NAV.map(({
          to,
          label,
          icon: Icon,
          match
        }) => {
          const active = pathname.startsWith(match);
          return <li key={to}>
                <NavLink to={to} aria-current={active ? 'page' : undefined} className="flex h-full flex-col items-center justify-center gap-1 text-xs font-semibold">
                  <span className={`inline-flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-150 ${active ? 'bg-ink text-paper' : 'text-ink-soft'}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className={active ? 'text-ink' : 'text-ink-soft'}>{label}</span>
                </NavLink>
              </li>;
        })}
        </ul>
      </nav>
    </div>;
}
