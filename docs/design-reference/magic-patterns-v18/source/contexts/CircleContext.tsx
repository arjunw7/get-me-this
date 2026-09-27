import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { GiftingMode } from '../types/wishlist';
interface CircleContextValue {
  mode: GiftingMode;
  setMode: (mode: GiftingMode) => void;
  reservations: Set<string>;
  isReserved: (productId: string) => boolean;
  toggleReservation: (productId: string) => void;
}
const CircleContext = createContext<CircleContextValue | null>(null);
interface CircleProviderProps {
  initialMode: GiftingMode;
  children: React.ReactNode;
}
export function CircleProvider({
  initialMode,
  children
}: CircleProviderProps) {
  const [mode, setMode] = useState<GiftingMode>(initialMode);
  const [reservations, setReservations] = useState<Set<string>>(() => new Set(['z-claws']));
  const isReserved = useCallback((id: string) => reservations.has(id), [reservations]);
  const toggleReservation = useCallback((id: string) => {
    setReservations(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);else next.add(id);
      return next;
    });
  }, []);
  const value = useMemo(() => ({
    mode,
    setMode,
    reservations,
    isReserved,
    toggleReservation
  }), [mode, reservations, isReserved, toggleReservation]);
  return <CircleContext.Provider value={value}>{children}</CircleContext.Provider>;
}
export function useCircle(): CircleContextValue {
  const ctx = useContext(CircleContext);
  if (!ctx) throw new Error('useCircle must be used inside CircleProvider');
  return ctx;
}
