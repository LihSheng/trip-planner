import { createContext, useContext, type ReactNode } from 'react';
import { useTripPlanner } from '../hooks/useTripPlanner';

export type TripContextValue = ReturnType<typeof useTripPlanner>;

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({
  shareToken,
  requestedPlanId,
  children,
}: {
  shareToken?: string;
  requestedPlanId?: string;
  children: ReactNode;
}) {
  const planner = useTripPlanner(shareToken, requestedPlanId);
  return <TripContext.Provider value={planner}>{children}</TripContext.Provider>;
}

export function useTrip(): TripContextValue {
  const context = useContext(TripContext);
  if (!context) throw new Error('useTrip must be used within a TripProvider');
  return context;
}
