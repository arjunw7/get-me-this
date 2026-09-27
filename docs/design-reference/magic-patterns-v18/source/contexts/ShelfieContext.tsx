import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { getMember, ME_ID } from '../data/members';
import { productsFor } from '../data/products';
import type { AccentColor, Product } from '../types/wishlist';
interface Profile {
  name: string;
  line: string;
}
interface ShelfieContextValue {
  items: Product[];
  setItems: (items: Product[]) => void;
  addItem: (item: Product) => void;
  removeItem: (id: string) => void;
  theme: AccentColor;
  setTheme: (theme: AccentColor) => void;
  profile: Profile;
  setProfile: (profile: Profile) => void;
}
const ShelfieContext = createContext<ShelfieContextValue | null>(null);
interface ShelfieProviderProps {
  startEmpty: boolean;
  newAccount?: boolean;
  children: React.ReactNode;
}
export function ShelfieProvider({
  startEmpty,
  newAccount = false,
  children
}: ShelfieProviderProps) {
  const me = getMember(ME_ID);
  const [items, setItems] = useState<Product[]>(() => startEmpty || newAccount ? [] : productsFor(ME_ID));
  const [theme, setTheme] = useState<AccentColor>(newAccount ? 'coral' : 'marigold');
  const [profile, setProfile] = useState<Profile>(newAccount ? {
    name: 'Arjun Rao',
    line: 'new here, taste loading…'
  } : {
    name: me.name,
    line: me.tagline
  });
  const addItem = useCallback((item: Product) => setItems(prev => [item, ...prev]), []);
  const removeItem = useCallback((id: string) => setItems(prev => prev.filter(p => p.id !== id)), []);
  const value = useMemo(() => ({
    items,
    setItems,
    addItem,
    removeItem,
    theme,
    setTheme,
    profile,
    setProfile
  }), [items, addItem, removeItem, theme, profile]);
  return <ShelfieContext.Provider value={value}>{children}</ShelfieContext.Provider>;
}
export function useShelfie(): ShelfieContextValue {
  const ctx = useContext(ShelfieContext);
  if (!ctx) throw new Error('useShelfie must be used inside ShelfieProvider');
  return ctx;
}
