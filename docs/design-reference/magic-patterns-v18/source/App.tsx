import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from './components/AppShell';
import { AuthProvider } from './contexts/AuthContext';
import { CircleProvider } from './contexts/CircleContext';
import { ShelfieProvider } from './contexts/ShelfieContext';
import { AddFromLink } from './pages/AddFromLink';
import { AuthEmail } from './pages/auth/AuthEmail';
import { ConfirmLink } from './pages/auth/ConfirmLink';
import { Onboarding } from './pages/auth/Onboarding';
import { VerifyEmail } from './pages/auth/VerifyEmail';
import { CircleRoom } from './pages/CircleRoom';
import { CreateGroup } from './pages/CreateGroup';
import { GiftingView } from './pages/GiftingView';
import { Groups } from './pages/Groups';
import { Home } from './pages/Home';
import { InviteAccept } from './pages/InviteAccept';
import { Landing } from './pages/Landing';
import { Shelfie } from './pages/Shelfie';
interface AppProps {
  giftingMode?: 'secret' | 'everyone' | 'browse';
  wishlistState?: 'filled' | 'empty';
  verifyCodeState?: 'default' | 'error' | 'expired';
  signInLinkState?: 'valid' | 'expired';
  homeState?: 'active' | 'new-account';
}
export function App({
  giftingMode = 'secret',
  wishlistState = 'filled',
  verifyCodeState = 'default',
  signInLinkState = 'valid',
  homeState = 'active'
}: AppProps) {
  const newAccount = homeState === 'new-account';
  return <BrowserRouter>
      <AuthProvider key={homeState} verifyVariant={verifyCodeState} linkVariant={signInLinkState} startAsNewAccount={newAccount}>
        <ShelfieProvider key={`${wishlistState}-${homeState}`} startEmpty={wishlistState === 'empty'} newAccount={newAccount}>
          <CircleProvider key={giftingMode} initialMode={giftingMode}>
            <Toaster position="top-center" toastOptions={{
            className: '!rounded-2xl !border-2 !border-ink !bg-ink !text-paper !font-sans !font-semibold'
          }} />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth" element={<AuthEmail />} />
              <Route path="/auth/verify" element={<VerifyEmail key={verifyCodeState} />} />
              <Route path="/auth/confirm" element={<ConfirmLink key={signInLinkState} />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/invite/diwali-scenes" element={<InviteAccept />} />
              <Route path="/add" element={<AddFromLink />} />
              <Route path="/groups/new" element={<CreateGroup />} />
              <Route element={<AppShell />}>
                <Route path="/home" element={<Home />} />
                <Route path="/wishlist" element={<Shelfie />} />
                <Route path="/groups" element={<Groups />} />
                <Route path="/groups/diwali-scenes" element={<CircleRoom />} />
                <Route path="/groups/diwali-scenes/gifting" element={<GiftingView />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </CircleProvider>
        </ShelfieProvider>
      </AuthProvider>
    </BrowserRouter>;
}
