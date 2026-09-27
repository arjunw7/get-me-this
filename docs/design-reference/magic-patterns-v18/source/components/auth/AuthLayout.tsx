import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon } from 'lucide-react';
import { Wordmark } from '../Wordmark';
import { AuthCollage } from './AuthCollage';
interface AuthLayoutProps {
  children: React.ReactNode;
  aside?: React.ReactNode;
  showDecor?: boolean;
  back?: {
    to: string;
    label: string;
  };
}
export function AuthLayout({
  children,
  aside,
  showDecor = true,
  back = {
    to: '/',
    label: 'Back to home'
  }
}: AuthLayoutProps) {
  return <div className="min-h-screen w-full bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" aria-label="Get Me This home">
          <Wordmark className="text-2xl sm:text-[28px]" />
        </Link>
        <Link to={back.to} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold hover:bg-cream">
          <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          {back.label}
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-[520px] flex-col px-5 pb-16 pt-2 sm:pt-8">
        {showDecor && <AuthCollage />}
        {children}
        {aside && <div className="mt-10">{aside}</div>}
      </main>
    </div>;
}
export const authCardCls = 'rounded-[28px] border-2 border-ink bg-white p-6 shadow-chunk sm:p-8';
export const primaryBtnCls = 'inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-coral px-6 text-lg font-bold text-ink shadow-chunk transition-transform duration-150 ease-snap active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60';
export const inputCls = 'mt-1.5 h-14 w-full rounded-2xl border-2 bg-white px-4 text-base outline-none placeholder:text-ink-mute focus:shadow-chunk-sm';
