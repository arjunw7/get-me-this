import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRightIcon, CalendarIcon, EyeOffIcon, LinkIcon, MapPinIcon, UsersRoundIcon, WalletIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AuthLayout, authCardCls, primaryBtnCls } from '../components/auth/AuthLayout';
import { Avatar } from '../components/Avatar';
import { AvatarStack } from '../components/AvatarStack';
import { useAuth } from '../contexts/AuthContext';
import { useCircle } from '../contexts/CircleContext';
import { diwaliCircle, giftingModes } from '../data/circle';
import { getMember, members } from '../data/members';
import { formatEventDate } from '../utils/dates';
import { formatINR } from '../utils/money';
const INVITE_URL = 'https://getmethis.app/invite/diwali-scenes';
export function InviteAccept() {
  const navigate = useNavigate();
  const {
    signedIn,
    intent,
    inviteJoined,
    joinInvite,
    setIntent,
    displayName
  } = useAuth();
  const {
    mode
  } = useCircle();
  const host = getMember('aanya');
  const joined = members.filter(m => m.status === 'joined');
  const style = giftingModes.find(m => m.id === mode);
  useEffect(() => {
    if (signedIn && intent === 'invite' && !inviteJoined) {
      joinInvite();
      toast(`You joined ${diwaliCircle.name}`);
    }
  }, [signedIn, intent, inviteJoined, joinInvite]);
  function join() {
    if (signedIn) {
      joinInvite();
      toast(`You joined ${diwaliCircle.name}`);
      return;
    }
    setIntent('invite');
    navigate('/auth?intent=invite');
  }
  function copyLink() {
    navigator.clipboard?.writeText(INVITE_URL).catch(() => undefined);
    toast('Invite link copied');
  }
  const facts = [{
    icon: CalendarIcon,
    label: 'When',
    value: formatEventDate(diwaliCircle.date)
  }, {
    icon: MapPinIcon,
    label: 'Where',
    value: diwaliCircle.venue
  }, {
    icon: WalletIcon,
    label: 'Budget',
    value: `${formatINR(diwaliCircle.budget)} per person`
  }, {
    icon: UsersRoundIcon,
    label: 'Gifting style',
    value: style?.name ?? ''
  }];
  return <AuthLayout showDecor={false} aside={<div className="rounded-[28px] border-2 border-dashed border-ink/30 bg-white p-6">
          <h2 className="font-display text-2xl font-extrabold">How it works in here</h2>
          <ul className="mt-4 flex flex-col gap-3 text-[15px] text-ink-soft">
            <li>Everyone shares a wishlist of things they actually want.</li>
            <li>You reserve a gift privately so nobody doubles up.</li>
            <li className="flex items-start gap-2 font-semibold text-ink">
              <EyeOffIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> The person receiving never sees what’s reserved.
            </li>
          </ul>
        </div>}>
      {inviteJoined ? <div className={authCardCls}>
          <p className="text-sm font-bold text-marigold-deep">{diwaliCircle.name}</p>
          <h1 className="mt-2 font-display text-4xl font-extrabold leading-[1] tracking-tight sm:text-[44px]">
            You’re in{displayName ? `, ${displayName}` : ''}.
          </h1>
          <p className="mt-3 text-lg text-ink-soft">
            Add a few things to your wishlist so the group knows what to get you, then have a look at theirs.
          </p>
          <div className="mt-7 flex flex-col gap-3">
            <Link to="/groups/diwali-scenes" className={primaryBtnCls}>
              Open the group <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link to="/add" className="inline-flex h-12 items-center justify-center rounded-2xl border-2 border-ink bg-white font-bold">
              Add an item to my wishlist
            </Link>
          </div>
        </div> : <div className="overflow-hidden rounded-[28px] border-2 border-ink bg-white shadow-chunk">
          <div className="border-b-2 border-ink bg-marigold p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <Avatar member={host} size="sm" />
              <p className="text-[15px] font-semibold">
                <span className="font-bold">{host.firstName}</span> invited you to
              </p>
            </div>
            <h1 className="mt-3 font-display text-5xl font-extrabold leading-[0.95] tracking-tight">{diwaliCircle.name}</h1>
            <p className="mt-2 font-semibold">A {diwaliCircle.occasion} gift exchange</p>
          </div>
          <div className="p-6 sm:p-8">
            <dl className="grid gap-3 sm:grid-cols-2">
              {facts.map(({
            icon: Icon,
            label,
            value
          }) => <div key={label} className="flex items-start gap-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" aria-hidden="true" />
                  <div>
                    <dt className="text-xs font-semibold text-ink-mute">{label}</dt>
                    <dd className="font-semibold">{value}</dd>
                  </div>
                </div>)}
            </dl>
            <div className="mt-6 flex items-center gap-3 border-t-2 border-dashed border-ink/10 pt-5">
              <AvatarStack members={members} max={5} />
              <span className="text-sm text-ink-soft">
                {joined.length} joined, {members.length - joined.length} invited
              </span>
            </div>
            <button type="button" onClick={join} className={`${primaryBtnCls} mt-6`}>
              Join the group <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={copyLink} className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-bold hover:bg-cream">
              <LinkIcon className="h-4 w-4" aria-hidden="true" /> Copy invite link
            </button>
          </div>
        </div>}
    </AuthLayout>;
}
