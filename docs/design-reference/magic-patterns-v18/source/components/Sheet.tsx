import React, { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}
export function Sheet({
  open,
  onClose,
  title,
  description,
  children
}: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => panelRef.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);
  return <AnimatePresence>
      {open && <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-ink/40" initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} transition={{
        duration: 0.2
      }} onClick={onClose} />
          <motion.div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} initial={{
        y: 24,
        opacity: 0,
        scale: 0.98
      }} animate={{
        y: 0,
        opacity: 1,
        scale: 1
      }} exit={{
        y: 24,
        opacity: 0,
        scale: 0.98
      }} transition={{
        duration: 0.24,
        ease: [0.23, 1, 0.32, 1]
      }} className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-[28px] border-2 border-ink bg-paper p-5 pb-8 shadow-chunk-lg outline-none sm:max-w-md sm:rounded-[28px] sm:pb-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id={titleId} className="font-display text-2xl font-extrabold leading-tight">
                  {title}
                </h2>
                {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-white transition-colors duration-150 hover:bg-cream">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>}
    </AnimatePresence>;
}
