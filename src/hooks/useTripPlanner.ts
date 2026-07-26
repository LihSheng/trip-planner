import { useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { TripPlanSummary } from '../lib/tripRepository';
import { useTripState } from './useTripState';
import { useTripPersistence, type SyncStatus } from './useTripPersistence';

export type { SyncStatus };

export function useTripPlanner(shareToken?: string, requestedPlanId?: string) {
  const { accessToken, user, isDemo } = useAuth();
  const isReadOnly = Boolean(shareToken);

  const tripState = useTripState(isReadOnly, user);
  const [planId, setPlanId] = useState<string | null>(null);
  const [plans, setPlans] = useState<TripPlanSummary[]>([]);
  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === planId),
    [planId, plans],
  );
  const persistence = useTripPersistence({
    state: tripState.state,
    setState: tripState.setState,
    planId,
    setPlanId,
    setPlans,
    shareToken,
    requestedPlanId,
  });

  return {
    state: tripState.state,
    planId,
    plans,
    activePlan,
    isReady: persistence.isReady,
    syncStatus: persistence.syncStatus,
    syncError: persistence.syncError,
    isOwner: !shareToken && (isDemo || activePlan?.isOwner === true),
    isReadOnly,
    placesById: tripState.placesById,
    activitiesById: tripState.activitiesById,
    addPlace: tripState.addPlace,
    addPlaceToDay: tripState.addPlaceToDay,
    addPlaceholderToDay: tripState.addPlaceholderToDay,
    replacePlaceholder: tripState.replacePlaceholder,
    fillPlaceholder: tripState.fillPlaceholder,
    updatePlace: tripState.updatePlace,
    updateActivity: tripState.updateActivity,
    removePlace: tripState.removePlace,
    removePlannerVisit: tripState.removePlannerVisit,
    addDay: tripState.addDay,
    updateDayLabel: tripState.updateDayLabel,
    updateDaySchedule: tripState.updateDaySchedule,
    updateStopSchedule: tripState.updateStopSchedule,
    removeDay: tripState.removeDay,
    reorderDays: tripState.reorderDays,
    toggleVisited: tripState.toggleVisited,
    updateExecution: tripState.updateExecution,
    addExpense: tripState.addExpense,
    move: tripState.move,
    setPlaceCluster: tripState.setPlaceCluster,
    renameLocationCluster: tripState.renameLocationCluster,
    ungroupLocationCluster: tripState.ungroupLocationCluster,
    replaceLocationClusterAnchor: tripState.replaceLocationClusterAnchor,
    updateTrip: tripState.updateTrip,
    updateLegMode: tripState.updateLegMode,
    applyAiDraft: tripState.applyAiDraft,
    reset: tripState.reset,
    switchPlan: persistence.switchPlan,
    createPlan: persistence.createPlan,
    syncNow: persistence.syncNow,
    persistForCloudSignIn: persistence.persistForCloudSignIn,
    activityEvents: persistence.activityEvents,
    refreshActivity: persistence.refreshActivity,
  };
}
