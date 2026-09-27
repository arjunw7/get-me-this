import React, { useState } from 'react';
import { CheckIcon, EyeOffIcon } from 'lucide-react';
import { diwaliCircle, giftingModes } from '../../data/circle';
import { getMember, members } from '../../data/members';
import { products } from '../../data/products';
import type { GiftingMode, Product } from '../../types/wishlist';
import { formatINR, toINR } from '../../utils/money';
import { Avatar } from '../Avatar';
import { AvatarStack } from '../AvatarStack';
const pick = (id: string) => products.find(p => p.id === id) as Product;
const benefits = [{
  title: 'See what everyone actually wants',
  body: 'Each person’s wishlist, with notes like size or colour.'
}, {
  title: 'Stay inside the budget',
  body: 'One amount per person. Pricier picks are flagged.'
}, {
  title: 'Reserve it so nobody doubles up',
  body: 'Everyone else sees it’s taken and picks something else.'
}, {
  title: 'The surprise stays secret',
  body: 'Kabir never sees what’s reserved on his own list.'
}];
function Marker({
  n,
  className = ''
}: {
  n: number;
  className?: string;
}) {
  return;
}
function Tile({
  p,
  children,
  dim = false
}: {
  p: Product;
  children?: React.ReactNode;
  dim?: boolean;
}) {
  return <li className="relative min-w-0">
      <img src={p.image} alt="" className={`aspect-square w-full rounded-2xl border-2 object-cover ${dim ? 'border-ink/20 opacity-45' : 'border-ink'}`} />
      {children}
      <p className="mt-2 truncate text-sm font-bold">{p.title}</p>
      <p className="text-xs font-semibold text-ink-mute">{formatINR(toINR(p.price, p.currency))}</p>
    </li>;
}
function GroupSnapshot() {
  const kabir = getMember('kabir');
  const zoya = getMember('zoya');
  return <figure aria-label="Example group: Diwali Scenes" className="relative rounded-[28px] border-2 border-ink bg-white shadow-chunk-lg">
      <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-t-[26px] border-b-2 border-ink bg-marigold px-5 py-4">
        <div>
          <p className="font-display text-2xl font-extrabold leading-tight">{diwaliCircle.name}</p>
          <p className="text-sm font-semibold">Sat, 7 Nov · 5 friends</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="relative rounded-full border-2 border-ink bg-paper px-3 py-1 text-sm font-bold">
            {formatINR(diwaliCircle.budget)} each
          </span>
          <AvatarStack members={members.filter(m => m.status === 'joined')} size="xs" />
        </div>
      </div>

      <div className="flex flex-col gap-6 p-5">
        <div className="relative">
          <p className="flex items-center gap-2 font-display font-extrabold">
            <Avatar member={kabir} size="xs" /> Kabir’s wishlist
          </p>
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:gap-4">
            <Tile p={pick('k-kettle')}>
              <span className="absolute left-1/2 top-2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border-2 border-ink bg-lime px-2 py-0.5 text-[10px] font-bold sm:text-[11px]">
                <CheckIcon className="h-3 w-3" strokeWidth={3} aria-hidden="true" /> Reserved by you
              </span>
              <Marker n={3} className="-right-2 -top-3" />
            </Tile>
            <Tile p={pick('k-vinyl')} />
            <Tile p={pick('k-bonsai')} dim>
              <span className="absolute inset-x-1.5 top-2 rounded-full bg-ink px-2 py-0.5 text-center text-[10px] font-bold text-paper sm:text-[11px]">
                Over budget
              </span>
            </Tile>
          </ul>
          <p className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1.5 text-xs font-bold">
            <EyeOffIcon className="h-3.5 w-3.5" aria-hidden="true" /> Kabir sees his list, but none of the reservations
          </p>
        </div>

        <div>
          <p className="flex items-center gap-2 font-display font-extrabold">
            <Avatar member={zoya} size="xs" /> Zoya’s wishlist
          </p>
          <ul className="mt-3 grid grid-cols-3 gap-3 sm:gap-4">
            <Tile p={pick('z-claws')}>
              <span className="absolute left-1/2 top-2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border-2 border-ink bg-white px-2 py-0.5 text-[10px] font-bold sm:text-[11px]">
                <EyeOffIcon className="h-3 w-3" aria-hidden="true" /> Taken
              </span>
            </Tile>
            <Tile p={pick('r-cups')} />
            <Tile p={pick('z-camera')} dim>
              <span className="absolute inset-x-1.5 top-2 rounded-full bg-ink px-2 py-0.5 text-center text-[10px] font-bold text-paper sm:text-[11px]">
                Over budget
              </span>
            </Tile>
          </ul>
        </div>
      </div>
    </figure>;
}
export function GroupDemoSection() {
  const [mode, setMode] = useState<GiftingMode>('secret');
  const selected = giftingModes.find(m => m.id === mode);
  return <section id="why" aria-labelledby="why-title" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-16">
        <div>
          <h2 id="why-title" className="font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl">
            Everyone’s wishlist in one place. No double gifts.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">Here’s what a group looks like once your friends are in.</p>

          <ol className="mt-8 flex flex-col gap-5">
            {benefits.map((b, i) => <li key={b.title} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-coral font-display text-sm font-extrabold">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-lg font-extrabold leading-tight">{b.title}</h3>
                  <p className="mt-0.5 text-ink-soft">{b.body}</p>
                </div>
              </li>)}
          </ol>

          
        </div>

        <div className="sm:pl-8 lg:pl-4">
          <GroupSnapshot />
        </div>
      </div>
    </section>;
}
