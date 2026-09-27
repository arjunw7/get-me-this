import React from 'react';
import { getMember } from '../../data/members';
import { products } from '../../data/products';
import { Avatar } from '../Avatar';
import { Tape } from '../Tape';
const pick = (id: string) => products.find(p => p.id === id)!;
export function AuthCollage() {
  const zoya = getMember('zoya');
  return <div className="relative mx-auto mb-6 flex h-[104px] w-full max-w-[340px] items-center justify-center" aria-hidden="true">
      <div className="relative -rotate-6">
        <img src={pick('a-matcha').image} alt="" className="h-20 w-20 rounded-2xl border-2 border-ink object-cover shadow-chunk-sm" />
      </div>
      <div className="relative -ml-3 mt-4 rotate-6">
        <Tape className="absolute -top-3 left-1/2 z-10 w-12 -translate-x-1/2" />
        <img src={pick('z-camera').image} alt="" className="h-20 w-20 rounded-2xl border-2 border-ink object-cover shadow-chunk-sm" />
      </div>
      <div className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-full rounded-bl-md border-2 border-ink bg-paper py-0.5 pl-0.5 pr-2.5 shadow-chunk-sm">
        <Avatar member={zoya} size="xs" />
        <span className="text-xs font-semibold">“very you”</span>
      </div>
    </div>;
}
