import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRightIcon, MailIcon } from 'lucide-react';
import { AuthLayout, authCardCls, inputCls, primaryBtnCls } from '../../components/auth/AuthLayout';
import { useAuth } from '../../contexts/AuthContext';
import { diwaliCircle } from '../../data/circle';
import { parseIntent } from '../../utils/authRedirect';
const intentNotes = {
  home: null,
  wishlist: 'First, a quick sign-in. Then you’ll add your first item.',
  'create-group': 'First, a quick sign-in. Then you’ll set up your group.',
  invite: `You’re joining ${diwaliCircle.name}. Sign in and we’ll take you straight back.`
} as const;
export function AuthEmail() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const {
    intent,
    setIntent,
    submitEmail
  } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    const fromUrl = parseIntent(params.get('intent'));
    if (fromUrl) setIntent(fromUrl);
  }, [params, setIntent]);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return setError('Enter your email so we know where to send the code.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setError('That email looks a little off. Check for typos?');
    setError('');
    setSending(true);
    window.setTimeout(() => {
      submitEmail(value);
      navigate('/auth/verify');
    }, 700);
  }
  const note = intentNotes[intent];
  return <AuthLayout>
      <div className={authCardCls}>
        {note && <p className="mb-5 rounded-2xl bg-marigold-soft px-4 py-3 text-center text-sm font-semibold">{note}</p>}
        <h1 className="text-center font-display text-4xl font-extrabold leading-[1] tracking-tight sm:text-[44px]">Welcome to Get Me This.</h1>
        <p className="mt-3 text-center text-lg text-ink-soft">
          Enter your email to start a wishlist, join a group, or pick up where you left off.
        </p>
        <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">
          <label className="block">
            <span className="text-sm font-bold">Email</span>
            <div className="relative">
              <MailIcon className="pointer-events-none absolute left-4 top-1/2 mt-[3px] h-5 w-5 -translate-y-1/2 text-ink-mute" aria-hidden="true" />
              <input type="email" autoComplete="email" autoFocus value={email} onChange={e => {
              setEmail(e.target.value);
              setError('');
            }} placeholder="you@example.com" aria-invalid={!!error} aria-describedby={error ? 'email-error' : 'email-help'} className={`${inputCls} pl-12 ${error ? 'border-coral-deep' : 'border-ink'}`} />
            </div>
          </label>
          {error && <p id="email-error" role="alert" className="-mt-2 text-sm font-semibold text-coral-deep">
              {error}
            </p>}
          <button type="submit" disabled={sending} className={primaryBtnCls}>
            {sending ? 'Sending…' : 'Continue with email'}
            {!sending && <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />}
          </button>
          <p id="email-help" className="text-center text-sm text-ink-mute">
            No password. We’ll send you a secure code and sign-in link.
          </p>
        </form>
      </div>
    </AuthLayout>;
}
