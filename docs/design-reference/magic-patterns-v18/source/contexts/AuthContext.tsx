import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { AuthIntent, LinkVariant, VerifyVariant } from '../types/auth';

/** Emails that already have an account in this prototype. Anything else is treated as new. */
const RETURNING_EMAILS = ['aanya@example.com'];
export const DEFAULT_EMAIL = 'arjun@example.com';
interface AuthContextValue {
  email: string;
  intent: AuthIntent;
  signedIn: boolean;
  isNewUser: boolean;
  /** True for an account created in this session that hasn't joined an existing group yet. */
  isFreshAccount: boolean;
  displayName: string;
  avatarUrl: string;
  inviteJoined: boolean;
  createdGroup: string;
  verifyVariant: VerifyVariant;
  linkVariant: LinkVariant;
  setIntent: (intent: AuthIntent) => void;
  submitEmail: (email: string) => void;
  completeSignIn: () => void;
  completeProfile: (name: string, avatarUrl: string) => void;
  joinInvite: () => void;
  createGroup: (name: string) => void;
  signOut: () => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);
interface AuthProviderProps {
  verifyVariant: VerifyVariant;
  linkVariant: LinkVariant;
  startAsNewAccount: boolean;
  children: React.ReactNode;
}
export function AuthProvider({
  verifyVariant,
  linkVariant,
  startAsNewAccount,
  children
}: AuthProviderProps) {
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [intent, setIntent] = useState<AuthIntent>('home');
  const [signedIn, setSignedIn] = useState(startAsNewAccount);
  const [isNewUser, setIsNewUser] = useState(!startAsNewAccount);
  const [isFreshAccount, setIsFreshAccount] = useState(startAsNewAccount);
  const [displayName, setDisplayName] = useState(startAsNewAccount ? 'Arjun' : '');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [inviteJoined, setInviteJoined] = useState(false);
  const [createdGroup, setCreatedGroup] = useState('');
  const submitEmail = useCallback((value: string) => {
    const clean = value.trim().toLowerCase();
    const isNew = !RETURNING_EMAILS.includes(clean);
    setEmail(clean);
    setIsNewUser(isNew);
    if (!isNew) setIsFreshAccount(false);
  }, []);
  const completeSignIn = useCallback(() => setSignedIn(true), []);
  const completeProfile = useCallback((name: string, url: string) => {
    setDisplayName(name);
    setAvatarUrl(url);
    setIsNewUser(false);
    setIsFreshAccount(true);
  }, []);
  const joinInvite = useCallback(() => {
    setInviteJoined(true);
    setIsFreshAccount(false);
  }, []);
  const createGroup = useCallback((name: string) => setCreatedGroup(name), []);
  const signOut = useCallback(() => {
    setSignedIn(false);
    setIntent('home');
  }, []);
  const value = useMemo(() => ({
    signOut,
    email,
    intent,
    signedIn,
    isNewUser,
    isFreshAccount,
    displayName,
    avatarUrl,
    inviteJoined,
    createdGroup,
    verifyVariant,
    linkVariant,
    setIntent,
    submitEmail,
    completeSignIn,
    completeProfile,
    joinInvite,
    createGroup
  }), [signOut, email, intent, signedIn, isNewUser, isFreshAccount, displayName, avatarUrl, inviteJoined, createdGroup, verifyVariant, linkVariant, submitEmail, completeSignIn, completeProfile, joinInvite, createGroup]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
