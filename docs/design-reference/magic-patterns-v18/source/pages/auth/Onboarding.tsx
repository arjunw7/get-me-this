import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightIcon } from 'lucide-react';
import { AuthLayout, authCardCls, inputCls, primaryBtnCls } from '../../components/auth/AuthLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useShelfie } from '../../contexts/ShelfieContext';
import { intentPath, nameFromEmail } from '../../utils/authRedirect';
const LINE_SUGGESTIONS = ['currently in my tiny-luxuries era', 'will travel for good coffee', 'my cart is a personality', 'yes, I need another tote'];
const LINE_MAX = 60;
export function Onboarding() {
  const navigate = useNavigate();
  const {
    email,
    intent,
    completeProfile
  } = useAuth();
  const {
    setProfile,
    setItems
  } = useShelfie();
  const [name, setName] = useState(nameFromEmail(email));
  const [line, setLine] = useState('');
  const [touched, setTouched] = useState(false);
  const nameError = touched && name.trim() === '';
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (name.trim() === '') return;
    completeProfile(name.trim(), '');
    setProfile({
      name: name.trim(),
      line: line.trim() || 'new here, taste loading…'
    });
    setItems([]);
    navigate(intentPath(intent, true));
  }
  return <AuthLayout back={{
    to: '/',
    label: 'Home'
  }}>
      <div className={authCardCls}>
        <p className="text-center text-sm font-bold text-coral-deep">One last thing</p>
        <h1 className="mt-2 text-center font-display text-4xl font-extrabold leading-[1] tracking-tight sm:text-[44px]">
          Tell friends who you are.
        </h1>
        <p className="mt-3 text-center text-lg text-ink-soft">This is how you’ll show up in groups and on your wishlist.</p>

        <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-6">
          <label className="block">
            <span className="text-sm font-bold">What should friends call you?</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Arjun" autoComplete="name" maxLength={40} aria-invalid={nameError} className={`${inputCls} ${nameError ? 'border-coral-deep' : 'border-ink'}`} />
            {nameError && <span className="mt-1.5 block text-sm font-semibold text-coral-deep">Friends need something to call you.</span>}
          </label>

          <div>
            <label htmlFor="personality-line" className="text-sm font-bold">
              Describe your taste in one line <span className="font-semibold text-ink-mute">(optional)</span>
            </label>
            <input id="personality-line" value={line} onChange={e => setLine(e.target.value.slice(0, LINE_MAX))} placeholder="e.g. currently in my tiny-luxuries era" maxLength={LINE_MAX} aria-describedby="line-help" className={`${inputCls} border-ink`} />
            <div id="line-help" className="mt-1.5 flex items-center justify-between text-xs text-ink-mute">
              <span>Shows under your name. Helps friends pick.</span>
              <span className="tabular-nums">
                {line.length}/{LINE_MAX}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Suggestions">
              {LINE_SUGGESTIONS.map(s => <button key={s} type="button" onClick={() => setLine(s)} aria-pressed={line === s} className={`inline-flex min-h-[36px] items-center rounded-full border-2 px-3 text-sm font-semibold transition-colors duration-150 ${line === s ? 'border-ink bg-ink text-paper' : 'border-ink/20 bg-white hover:border-ink'}`}>
                  {s}
                </button>)}
            </div>
          </div>

          <button type="submit" className={primaryBtnCls}>
            Let’s go <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </form>
      </div>
    </AuthLayout>;
}
