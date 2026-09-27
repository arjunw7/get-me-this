import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGridIcon, LogOutIcon, PencilIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useShelfie } from '../contexts/ShelfieContext';
import { getMember, ME_ID } from '../data/members';
import { Avatar } from './Avatar';
import { Sheet } from './Sheet';
import { EditProfileSheet } from './shelfie/EditProfileSheet';
interface AccountMenuProps {
  variant: 'sidebar' | 'topbar';
}
export function AccountMenu({
  variant
}: AccountMenuProps) {
  const navigate = useNavigate();
  const {
    profile,
    theme
  } = useShelfie();
  const {
    signOut,
    email
  } = useAuth();
  const me = getMember(ME_ID);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  function choose(action: () => void) {
    setOpen(false);
    action();
  }
  function logOut() {
    setConfirming(false);
    signOut();
    navigate('/');
    toast('You’re logged out. See you soon.');
  }
  const itemCls = 'flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-semibold transition-colors duration-150 hover:bg-cream focus-visible:bg-cream focus-visible:outline-none';
  return <div ref={wrapRef} className={`relative ${variant === 'sidebar' ? 'mt-auto' : ''}`}>
      <button ref={triggerRef} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={variant === 'topbar' ? 'Account menu' : undefined} onClick={() => setOpen(o => !o)} className={variant === 'sidebar' ? 'flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors duration-150 hover:bg-cream' : 'flex h-11 w-11 items-center justify-center rounded-full'}>
        <Avatar member={me} size="sm" colorOverride={theme} />
        {variant === 'sidebar' && <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{profile.name}</span>
            <span className="block truncate text-xs text-ink-mute">{profile.line}</span>
          </span>}
      </button>

      <AnimatePresence>
        {open && <motion.div role="menu" aria-label="Account" initial={{
        opacity: 0,
        scale: 0.96,
        y: variant === 'sidebar' ? 6 : -6
      }} animate={{
        opacity: 1,
        scale: 1,
        y: 0
      }} exit={{
        opacity: 0,
        scale: 0.96
      }} transition={{
        duration: 0.16,
        ease: [0.23, 1, 0.32, 1]
      }} className={`absolute z-50 w-60 rounded-2xl border-2 border-ink bg-paper p-1.5 shadow-chunk ${variant === 'sidebar' ? 'bottom-full left-0 mb-2 origin-bottom-left' : 'right-0 top-full mt-2 origin-top-right'}`}>
            <p className="truncate px-3 pb-2 pt-1.5 text-xs text-ink-mute">{email}</p>
            <button type="button" role="menuitem" className={itemCls} onClick={() => choose(() => navigate('/wishlist'))}>
              <LayoutGridIcon className="h-4 w-4" aria-hidden="true" /> My wishlist
            </button>
            <button type="button" role="menuitem" className={itemCls} onClick={() => choose(() => setEditing(true))}>
              <PencilIcon className="h-4 w-4" aria-hidden="true" /> Edit profile
            </button>
            <div className="my-1 border-t-2 border-ink/10" />
            <button type="button" role="menuitem" className={itemCls} onClick={() => choose(() => setConfirming(true))}>
              <LogOutIcon className="h-4 w-4" aria-hidden="true" /> Log out
            </button>
          </motion.div>}
      </AnimatePresence>

      <EditProfileSheet open={editing} onClose={() => setEditing(false)} />

      <Sheet open={confirming} onClose={() => setConfirming(false)} title="Log out of Get Me This?" description="Your wishlist and reservations stay saved. Next time, we’ll email you a code to get back in.">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setConfirming(false)} className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-ink bg-white px-5 font-bold hover:bg-cream">
            Cancel
          </button>
          <button type="button" onClick={logOut} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border-2 border-ink bg-coral px-5 font-bold text-ink shadow-chunk-sm transition-transform duration-150 ease-snap active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
            <LogOutIcon className="h-4 w-4" aria-hidden="true" /> Log out
          </button>
        </div>
      </Sheet>
    </div>;
}
