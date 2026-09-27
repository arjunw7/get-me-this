import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircleIcon, ClockIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AuthLayout, authCardCls, primaryBtnCls } from '../../components/auth/AuthLayout';
import { InboxPreview } from '../../components/auth/InboxPreview';
import { OtpInput } from '../../components/auth/OtpInput';
import { useAuth } from '../../contexts/AuthContext';
import type { VerifyVariant } from '../../types/auth';
import { postVerifyPath } from '../../utils/authRedirect';
type Status = 'idle' | 'verifying' | 'error' | 'expired';
const EMPTY = ['', '', '', '', '', ''];
const RESEND_SECONDS = 30;
function initialStatus(v: VerifyVariant): Status {
  return v === 'error' ? 'error' : v === 'expired' ? 'expired' : 'idle';
}
export function VerifyEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const {
    email,
    intent,
    isNewUser,
    completeSignIn,
    verifyVariant
  } = useAuth();
  const variant = params.get('state') as VerifyVariant | null ?? verifyVariant;
  const [digits, setDigits] = useState<string[]>(variant === 'default' ? EMPTY : '482913'.split(''));
  const [status, setStatus] = useState<Status>(initialStatus(variant));
  const [message, setMessage] = useState(variant === 'error' ? 'That code doesn’t match. Check the latest email and try again.' : '');
  const [seconds, setSeconds] = useState(variant === 'expired' ? 0 : RESEND_SECONDS);
  useEffect(() => {
    if (seconds <= 0) return;
    const t = window.setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [seconds]);
  function update(next: string[]) {
    setDigits(next);
    if (status === 'error') {
      setStatus('idle');
      setMessage('');
    }
  }
  function resend() {
    setSeconds(RESEND_SECONDS);
    setDigits(EMPTY);
    setStatus('idle');
    setMessage('');
    toast(`New code sent to ${email}`);
  }
  function verify(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'expired') return resend();
    const code = digits.join('');
    if (code.length < 6) {
      setStatus('error');
      setMessage('Enter all six digits.');
      return;
    }
    if (code === '000000') {
      setStatus('error');
      setMessage('That code doesn’t match. Check the latest email and try again.');
      return;
    }
    setStatus('verifying');
    window.setTimeout(() => {
      completeSignIn();
      navigate(postVerifyPath(intent, isNewUser));
    }, 900);
  }
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  return <AuthLayout aside={<InboxPreview />} back={{
    to: '/auth',
    label: 'Change email'
  }}>
      <div className={authCardCls}>
        <h1 className="text-center font-display text-4xl font-extrabold leading-[1] tracking-tight sm:text-[44px]">Check your inbox.</h1>
        <p className="mt-3 text-center text-lg text-ink-soft">
          We sent a six-digit code and a sign-in link to <span className="font-bold text-ink">{email}</span>.
        </p>

        <form onSubmit={verify} noValidate className="mt-7">
          <p id="otp-label" className="mb-2 text-center text-sm font-bold">
            Six-digit code
          </p>
          <OtpInput digits={digits} onChange={update} invalid={status === 'error'} disabled={status === 'verifying' || status === 'expired'} labelledBy="otp-label" describedBy={message ? 'otp-message' : 'otp-note'} />

          {status === 'error' && <p id="otp-message" role="alert" className="mt-3 flex items-start gap-2 text-sm font-semibold text-coral-deep">
              <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {message}
            </p>}
          {status === 'expired' && <div id="otp-message" role="alert" className="mt-4 rounded-2xl border-2 border-ink bg-marigold-soft p-4 text-sm">
              <p className="flex items-center gap-2 font-bold">
                <ClockIcon className="h-4 w-4" aria-hidden="true" /> That code has expired.
              </p>
              <p className="mt-1 text-ink-soft">Codes last 10 minutes. We’ll send you a fresh one.</p>
            </div>}

          <button type="submit" disabled={status === 'verifying'} className={`${primaryBtnCls} mt-6`}>
            {status === 'verifying' ? 'Verifying…' : status === 'expired' ? 'Send a new code' : 'Verify and continue'}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          {seconds > 0 ? <span className="inline-flex h-11 items-center font-semibold text-ink-mute" aria-live="polite">
              Resend code in {mm}:{ss}
            </span> : <button type="button" onClick={resend} className="inline-flex h-11 items-center font-bold underline-offset-4 hover:underline">
              Resend code
            </button>}
          <Link to="/auth" className="inline-flex h-11 items-center font-bold underline-offset-4 hover:underline">
            Change email
          </Link>
        </div>

        <p id="otp-note" className="mt-4 border-t-2 border-dashed border-ink/10 pt-4 text-sm text-ink-soft">
          Enter the code here, or tap the sign-in button in the email. Either works.
        </p>
      </div>
    </AuthLayout>;
}
