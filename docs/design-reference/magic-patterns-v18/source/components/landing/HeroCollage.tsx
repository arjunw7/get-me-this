import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { LockIcon } from 'lucide-react';
import { getMember } from '../../data/members';
import { products } from '../../data/products';
import type { Product } from '../../types/wishlist';
import { Avatar } from '../Avatar';
import { PriceTag } from '../PriceTag';
import { Tape } from '../Tape';
const pick = (id: string): Product => products.find(p => p.id === id) as Product;
const cards = [{
  product: pick('a-matcha'),
  pos: 'left-0 top-10 -rotate-6',
  delay: 0
}, {
  product: pick('k-kettle'),
  pos: 'left-[30%] top-0 rotate-3 z-10',
  delay: 0.06,
  tape: true
}, {
  product: pick('z-camera'),
  pos: 'right-0 top-32 -rotate-2',
  delay: 0.12
}];
const bubbles = [{
  memberId: 'zoya',
  text: 'very you',
  pos: 'left-1 top-[250px] sm:top-[280px]',
  delay: 0.26
}, {
  memberId: 'rohan',
  text: 'questionable, but supported',
  pos: 'left-[18%] top-[345px] sm:left-[28%] sm:top-[370px]',
  delay: 0.32
}, {
  memberId: 'sam',
  text: 'I want this too',
  pos: 'right-2 top-[400px] sm:top-[440px]',
  delay: 0.38
}];
export function HeroCollage() {
  const reduce = useReducedMotion();
  const enter = (delay: number) => reduce ? {} : {
    initial: {
      opacity: 0,
      y: 16,
      scale: 0.96
    },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1
    },
    transition: {
      duration: 0.3,
      delay,
      ease: [0.23, 1, 0.32, 1]
    }
  };
  return <div className="relative mx-auto h-[470px] w-full max-w-[520px] sm:h-[520px]" aria-hidden="true">
      {cards.map(({
      product,
      pos,
      delay,
      tape
    }) => {
      const owner = getMember(product.ownerId);
      return <motion.div key={product.id} {...enter(delay)} className={`absolute w-[46%] max-w-[220px] ${pos}`}>
            <div className="relative">
              {tape && <Tape className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rotate-2" />}
              <div className="overflow-hidden rounded-[24px] border-2 border-ink bg-white shadow-chunk">
                <div className="flex items-center gap-2 border-b-2 border-ink px-3 py-2">
                  <Avatar member={owner} size="xs" />
                  <span className="truncate text-xs font-bold">{owner.firstName}'s wishlist</span>
                </div>
                <div className="relative aspect-square bg-cream">
                  <img src={product.image} alt="" className="h-full w-full object-cover" />
                  {tape && <span className="absolute bottom-2 right-2 inline-flex rotate-[-4deg] items-center gap-1 rounded-full border-2 border-ink bg-lime px-2 py-0.5 text-[11px] font-bold">
                      <LockIcon className="h-3 w-3" /> Reserved secretly
                    </span>}
                </div>
                <div className="p-3">
                  <p className="font-display text-sm font-bold leading-tight">{product.title}</p>
                  <p className="mt-1 text-xs">
                    <PriceTag price={product.price} currency={product.currency} />
                  </p>
                </div>
              </div>
            </div>
          </motion.div>;
    })}

      {bubbles.map(({
      memberId,
      text,
      pos,
      delay
    }) => {
      const m = getMember(memberId);
      return <motion.div key={memberId} {...enter(delay)} className={`absolute z-20 inline-flex items-center gap-2 rounded-full rounded-bl-md border-2 border-ink bg-paper py-1 pl-1 pr-3 shadow-chunk-sm ${pos}`}>
            <Avatar member={m} size="xs" />
            <span className="whitespace-nowrap text-sm font-semibold">“{text}”</span>
          </motion.div>;
    })}
    </div>;
}
