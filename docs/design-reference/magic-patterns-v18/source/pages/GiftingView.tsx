import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, EyeOffIcon, RulerIcon } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { GiftList } from '../components/gifting/GiftList';
import { RecipientChecklist } from '../components/gifting/RecipientChecklist';
import { useCircle } from '../contexts/CircleContext';
import { diwaliCircle, secretDrawRecipientId } from '../data/circle';
import { getMember } from '../data/members';
import { productsFor } from '../data/products';
import { formatINR, toINR } from '../utils/money';
function PrivacyNote({
  children
}: {
  children: React.ReactNode;
}) {
  return <p className="mt-5 flex items-start gap-2.5 rounded-2xl bg-white/15 px-4 py-3 text-[15px] font-medium text-white">
      <EyeOffIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>;
}
export function GiftingView() {
  const {
    mode
  } = useCircle();
  const budget = diwaliCircle.budget;
  return <div className="mx-auto w-full max-w-6xl px-5 pt-4 sm:px-8 lg:pt-10">
      <Link to="/groups/diwali-scenes" className="inline-flex h-11 items-center gap-1.5 text-sm font-bold">
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> {diwaliCircle.name}
      </Link>
      {mode === 'secret' && <SecretDraw budget={budget} />}
      {mode === 'everyone' && <>
          <header className="rounded-[32px] border-2 border-ink bg-electric p-6 text-white shadow-chunk sm:p-8">
            <p className="text-sm font-semibold text-white/85">Gift everyone · {diwaliCircle.name}</p>
            <h1 className="mt-2 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">Your gifting checklist</h1>
            <p className="mt-3 text-lg text-white/90">{formatINR(budget)} per person. Tick them off at your own pace.</p>
            <PrivacyNote>Nobody can see what’s reserved for them. Your friends can’t see your list, and you can’t see theirs.</PrivacyNote>
          </header>
          <div className="mt-8">
            <RecipientChecklist />
          </div>
        </>}
      {mode === 'browse' && <section className="rounded-[32px] border-2 border-dashed border-ink/40 bg-white p-8 text-center">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">No assignments in this group.</h1>
          <p className="mx-auto mt-3 max-w-md text-ink-soft">
            {diwaliCircle.name} is sharing wishlists only. Reserve anything from any wishlist. Recipients never see it.
          </p>
          <Link to="/groups/diwali-scenes" className="mt-6 inline-flex h-12 items-center rounded-2xl border-2 border-ink bg-electric px-6 font-bold text-white">
            Browse wishlists
          </Link>
        </section>}
    </div>;
}
function SecretDraw({
  budget
}: {
  budget: number;
}) {
  const kabir = getMember(secretDrawRecipientId);
  const items = productsFor(kabir.id);
  const fits = items.filter(p => toINR(p.price, p.currency) <= budget).length;
  return <div className="grid gap-8 lg:grid-cols-[360px_1fr] lg:items-start">
      <aside className="flex flex-col gap-5 lg:sticky lg:top-8">
        <header className="relative rounded-[32px] border-2 border-ink bg-electric p-6 text-white shadow-chunk sm:p-7">
          <p className="text-sm font-semibold text-white/85">Names drawn privately · {diwaliCircle.name}</p>
          <div className="mt-3 flex items-center justify-between gap-4">
            <h1 className="font-display text-[42px] font-extrabold leading-[0.92] tracking-tight sm:text-5xl">You got Kabir</h1>
            <Avatar member={kabir} size="xl" colorOverride="lime" className="shrink-0 rotate-6" />
          </div>
          <span className="mt-4 inline-block -rotate-2 rounded-lg border-2 border-ink bg-paper px-3 py-1 font-display text-lg font-extrabold text-ink shadow-chunk-sm">
            Act surprised.
          </span>
          <PrivacyNote>Kabir can’t see reservations. Not yours, not anyone’s. He’ll find out on {formatDay()}.</PrivacyNote>
        </header>

        <section aria-labelledby="taste-title" className="rounded-[28px] border-2 border-ink bg-white p-5">
          <h2 id="taste-title" className="font-display text-lg font-extrabold">Kabir, in short</h2>
          <p className="mt-1 text-[15px] italic text-ink-soft">“{kabir.tagline}”</p>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Taste tags">
            {kabir.tastes?.map(t => <li key={t} className="rounded-full bg-electric-soft px-3 py-1 text-sm font-semibold text-electric-deep">
                {t}
              </li>)}
          </ul>
          {kabir.sizes && <p className="mt-4 flex items-center gap-2 border-t-2 border-dashed border-ink/10 pt-4 text-sm">
              <RulerIcon className="h-4 w-4 text-ink-mute" aria-hidden="true" />
              <span className="font-semibold">{kabir.sizes}</span>
            </p>}
        </section>
      </aside>

      <div>
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-2xl font-extrabold">Kabir’s wishlist</h2>
          <p className="text-sm text-ink-mute">
            Budget {formatINR(budget)} · {fits} of {items.length} fit
          </p>
        </div>
        <GiftList recipient={kabir} items={items} budget={budget} columns="sm:grid-cols-2" />
      </div>
    </div>;
}
function formatDay(): string {
  return new Date(diwaliCircle.date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long'
  });
}
