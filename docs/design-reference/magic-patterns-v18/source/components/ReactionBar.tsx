import React, { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { members } from '../data/members';
import type { ReactionKey } from '../types/wishlist';
export const reactionLabels: Record<ReactionKey, string> = {
  veryYou: 'very you',
  questionable: 'questionable, but supported',
  wantToo: 'I want this too'
};
const ORDER: ReactionKey[] = ['veryYou', 'questionable', 'wantToo'];
const STYLE: Record<ReactionKey, {
  fill: string;
  glyphOnFill: string;
  short: string;
}> = {
  veryYou: {
    fill: 'bg-coral',
    glyphOnFill: '#17140F',
    short: 'Very you'
  },
  questionable: {
    fill: 'bg-marigold',
    glyphOnFill: '#17140F',
    short: 'Questionable'
  },
  wantToo: {
    fill: 'bg-electric',
    glyphOnFill: '#FFFFFF',
    short: 'Want it too'
  }
};
function Glyph({
  kind,
  color,
  className = 'h-5 w-5'
}: {
  kind: ReactionKey;
  color: string;
  className?: string;
}) {
  const common = {
    stroke: color,
    strokeWidth: 3,
    fill: 'none'
  } as const;
  return <svg viewBox="0 0 40 40" className={`overflow-visible ${className}`} aria-hidden="true">
      {kind === 'veryYou' && <path d="M20 5 L23 17 L36 20 L23 23 L20 35 L17 23 L4 20 L17 17 Z" strokeLinejoin="round" {...common} />}
      {kind === 'questionable' && <>
          <path d="M12 14c0-5.5 4-9 9-9s9 3.4 9 8.4c0 5.6-6.4 6.6-8.4 11.2" strokeLinecap="round" {...common} />
          <circle cx="21" cy="32" r="2.4" fill={color} />
        </>}
      {kind === 'wantToo' && <path d="M20 32c-9-7.5-13-13.2-13-18.4C7 8.6 10.6 5 15 5c2.6 0 4.9 1.6 5 4.4C20.1 6.6 22.4 5 25 5c4.4 0 8 3.6 8 8.6 0 5.2-4 10.9-13 18.4Z" strokeLinejoin="round" {...common} />}
    </svg>;
}
interface ReactButtonProps {
  kind: ReactionKey;
  active: boolean;
  onPress: () => void;
}
function ReactButton({
  kind,
  active,
  onPress
}: ReactButtonProps) {
  const reduce = useReducedMotion();
  const [popId, setPopId] = useState(0);
  const s = STYLE[kind];
  function press() {
    if (!active) setPopId(n => n + 1);
    onPress();
  }
  return <motion.button type="button" aria-pressed={active} aria-label={`React “${reactionLabels[kind]}”`} title={reactionLabels[kind]} onClick={press} whileTap={reduce ? undefined : {
    scale: 0.94,
    y: 1
  }} transition={{
    duration: 0.12,
    ease: [0.23, 1, 0.32, 1]
  }} className={`flex h-[60px] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 transition-[background-color,border-color,box-shadow] duration-150 ${active ? `border-ink ${s.fill} shadow-chunk-sm` : 'border-transparent hover:bg-cream'}`}>
      <motion.span key={popId} initial={reduce || popId === 0 ? false : {
      scale: 0.6,
      rotate: -12
    }} animate={{
      scale: 1,
      rotate: 0
    }} transition={{
      duration: 0.28,
      ease: [0.34, 1.56, 0.64, 1]
    }} className="flex">
        <Glyph kind={kind} color={active ? s.glyphOnFill : '#17140F'} />
      </motion.span>
      <span className={`truncate text-xs font-bold ${active && kind === 'wantToo' ? 'text-white' : 'text-ink'}`}>{s.short}</span>
    </motion.button>;
}
interface ReactionBarProps {
  counts?: Partial<Record<ReactionKey, number>>;
  productTitle: string;
  ownerId?: string;
}
export function ReactionBar({
  counts = {},
  productTitle,
  ownerId
}: ReactionBarProps) {
  const [mine, setMine] = useState<ReactionKey | null>(null);
  const totals = ORDER.map(k => [k, (counts[k] ?? 0) + (mine === k ? 1 : 0)] as const);
  const present = totals.filter(([, n]) => n > 0);
  const total = totals.reduce((sum, [, n]) => sum + n, 0);
  const othersTotal = total - (mine ? 1 : 0);
  const friendNames = members.filter(m => m.status === 'joined' && !m.isMe && m.id !== ownerId).slice(0, Math.min(othersTotal, 1)).map(m => m.firstName);
  let summary = 'Be the first to react';
  if (mine && othersTotal === 0) summary = 'You reacted';else if (mine) summary = `You and ${othersTotal} ${othersTotal === 1 ? 'other' : 'others'}`;else if (othersTotal === 1) summary = friendNames[0] ?? '1 friend';else if (othersTotal > 1) summary = `${friendNames[0]} and ${othersTotal - 1} ${othersTotal - 1 === 1 ? 'other' : 'others'}`;
  return <div>
      {/* Summary, like the reaction line under a post */}
      <div className="flex min-h-[28px] items-center gap-2">
        {present.length > 0 && <span className="flex" aria-hidden="true">
            {present.map(([k], i) => <span key={k} className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white ${STYLE[k].fill} ${i > 0 ? '-ml-1.5' : ''}`}>
                <Glyph kind={k} color={STYLE[k].glyphOnFill} className="h-3 w-3" />
              </span>)}
          </span>}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={summary} initial={{
          opacity: 0,
          y: 3
        }} animate={{
          opacity: 1,
          y: 0
        }} exit={{
          opacity: 0,
          y: -3
        }} transition={{
          duration: 0.15,
          ease: [0.23, 1, 0.32, 1]
        }} className="truncate text-sm text-ink-soft" aria-live="polite">
            {summary}
          </motion.span>
        </AnimatePresence>
        {present.length > 0 && <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums text-ink-mute">
            {total}
          </span>}
      </div>

      {mine && <p className="mt-1 text-xs font-semibold text-ink-mute">
          You said “{reactionLabels[mine]}”
        </p>}

      <div role="group" aria-label={`React to ${productTitle}`} className="mt-3 grid grid-cols-3 gap-1.5 border-t-2 border-ink/10 pt-3">
        {ORDER.map(key => <ReactButton key={key} kind={key} active={mine === key} onPress={() => setMine(prev => prev === key ? null : key)} />)}
      </div>
    </div>;
}
interface ReactionSummaryProps {
  counts?: Partial<Record<ReactionKey, number>>;
}
export function ReactionSummary({
  counts = {}
}: ReactionSummaryProps) {
  const entries = ORDER.map(k => [k, counts[k] ?? 0] as const).filter(([, n]) => n > 0);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  if (entries.length === 0) {
    return <p className="text-sm text-ink-mute">No reactions yet</p>;
  }
  return <div className="border-t-2 border-ink/10 pt-3">
      <div className="flex items-center gap-2">
        <span className="flex" aria-hidden="true">
          {entries.map(([k], i) => <span key={k} className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white ${STYLE[k].fill} ${i > 0 ? '-ml-1.5' : ''}`}>
              <Glyph kind={k} color={STYLE[k].glyphOnFill} className="h-3 w-3" />
            </span>)}
        </span>
        <span className="text-sm text-ink-soft">
          {total} {total === 1 ? 'friend reacted' : 'friends reacted'}
        </span>
      </div>
      <ul className="mt-2 flex flex-col gap-1" aria-label="Reactions from friends">
        {entries.map(([k, n]) => <li key={k} className="flex items-center gap-2 text-sm">
            <Glyph kind={k} color="#17140F" className="h-3.5 w-3.5 shrink-0" />
            <span className="font-bold tabular-nums">{n}</span>
            <span className="truncate text-ink-soft">{reactionLabels[k]}</span>
          </li>)}
      </ul>
    </div>;
}
