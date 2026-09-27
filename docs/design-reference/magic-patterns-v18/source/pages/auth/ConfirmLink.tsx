import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckIcon, Link2OffIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { AuthLayout, authCardCls, primaryBtnCls } from '../../components/auth/AuthLayout';
import { useAuth } from '../../contexts/AuthContext';
import type { LinkVariant } from '../../types/auth';
import { postVerifyPath } from '../../utils/authRedirect';
type Status = 'loading' | 'success' | 'expired';
export function ConfirmLink() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const {
    email,
    intent,
    isNewUser,
    completeSignIn,
    linkVariant
  } = useAuth();
  const variant = params.get('state') as LinkVariant | null ?? linkVariant;
  const [status, setStatus] = useState<Status>('loading');
  useEffect(() => {
    const t1 = window.setTimeout(() => {
      if (variant === 'expired') {
        setStatus('expired');
        return;
      }
      setStatus('success');
      completeSignIn();
    }, 1200);
    return () => window.clearTimeout(t1);
  }, [variant, completeSignIn]);
  useEffect(() => {
    if (status !== 'success') return;
    const t = window.setTimeout(() => navigate(postVerifyPath(intent, isNewUser)), 1000);
    return () => window.clearTimeout(t);
  }, [status, navigate, intent, isNewUser]);
  function resendEmail() {
    toast(`Fresh sign-in email sent to ${email}`);
    navigate('/auth/verify');
  }
  return <AuthLayout>
      <div className={`${authCardCls} text-center`}>
        <AnimatePresence mode="wait">
          <motion.div key={status} role="status" aria-live="polite" initial={{
          opacity: 0,
          y: 6
        }} animate={{
          opacity: 1,
          y: 0
        }} exit={{
          opacity: 0,
          y: -6
        }} transition={{
          duration: 0.2,
          ease: [0.23, 1, 0.32, 1]
        }} className="flex flex-col items-center">
            {status === 'loading' && <>
                <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-ink bg-cream">
                  <Loader2Icon className="h-8 w-8 animate-spin" aria-hidden="true" />
                </span>
                <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight">Signing you in…</h1>
                <p className="mt-2 text-ink-soft">Checking your link. This takes a second.</p>
              </>}
            {status === 'success' && <>
                <span className="flex h-20 w-20 -rotate-6 items-center justify-center rounded-full border-2 border-ink bg-lime shadow-chunk-sm">
                  <CheckIcon className="h-9 w-9" strokeWidth={3} aria-hidden="true" />
                </span>
                <h1 className="mt-6 font-display text-4xl font-extrabold tracking-tight">You’re in.</h1>
                <p className="mt-2 text-ink-soft">Taking you where you were headed…</p>
              </>}
            {status === 'expired' && <>
                <span className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-ink bg-marigold-soft">
                  <Link2OffIcon className="h-8 w-8" aria-hidden="true" />
                </span>
                <h1 className="mt-6 font-display text-4xl font-extrabold leading-[1.02] tracking-tight">This link has expired.</h1>
                <p className="mt-2 text-ink-soft">
                  Sign-in links only work once and last 10 minutes. No harm done. We’ll send a new one.
                </p>
                <button type="button" onClick={resendEmail} className={`${primaryBtnCls} mt-7`}>
                  Send a new email
                </button>
                <Link to="/auth" className="mt-3 inline-flex h-12 items-center font-bold underline-offset-4 hover:underline">
                  Use a different email
                </Link>
              </>}
          </motion.div>
        </AnimatePresence>
      </div>
    </AuthLayout>;
}
