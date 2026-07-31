import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTripState } from './useTripState';
import { useTripLifecycle, type SyncStatus } from './useTripLifecycle';

export type { SyncStatus };

export function useTripPlanner(shareToken?: string, requestedPlanId?: string) {
  const { user, isDemo } = useAuth();
  const [forcedReadOnly, setForcedReadOnly] = useState(false);
  const isReadOnly = Boolean(shareToken) || forcedReadOnly;

  const tripState = useTripState(isReadOnly, user);
  const lifecycle = useTripLifecycle({
    state: tripState.state,
    setState: tripState.setState,
    setForcedReadOnly,
    shareToken,
    requestedPlanId,
  });

  return {
    state: tripState.state,
    planId: lifecycle.planId,
    plans: lifecycle.plans,
    activePlan: lifecycle.activePlan,
    isReady: lifecycle.isReady,
    loadBlocked: lifecycle.loadBlocked,
    retryLoad: lifecycle.retryLoad,
    syncStatus: lifecycle.syncStatus,
    syncError: lifecycle.syncError,
    syncConflicts: lifecycle.syncConflicts,
    resolveConflict: lifecycle.resolveConflict,
    getSynchronizedState: lifecycle.getSynchronizedState,
    isOwner: !shareToken && (isDemo || lifecycle.activePlan?.isOwner === true),
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
    addDayTask: tripState.addDayTask,
    updateDayTask: tripState.updateDayTask,
    toggleDayTask: tripState.toggleDayTask,
    deleteDayTask: tripState.deleteDayTask,
    reorderDayTasks: tripState.reorderDayTasks,
    moveDayTask: tripState.moveDayTask,
    reorderDays: tripState.reorderDays,
    toggleVisited: tripState.toggleVisited,
    updateExecution: tripState.updateExecution,
    addExpense: tripState.addExpense,
    updateExpense: tripState.updateExpense,
    deleteExpense: tripState.deleteExpense,
    saveStayBooking: tripState.saveStayBooking,
    deleteStayBooking: tripState.deleteStayBooking,
    saveFlightBooking: tripState.saveFlightBooking,
    deleteFlightBooking: tripState.deleteFlightBooking,
    updateBudget: tripState.updateBudget,
    move: tripState.move,
    setPlaceCluster: tripState.setPlaceCluster,
    renameLocationCluster: tripState.renameLocationCluster,
    ungroupLocationCluster: tripState.ungroupLocationCluster,
    replaceLocationClusterAnchor: tripState.replaceLocationClusterAnchor,
    updateTrip: tripState.updateTrip,
    updateLegMode: tripState.updateLegMode,
    applyAiDraft: tripState.applyAiDraft,
    reset: tripState.reset,
    switchPlan: lifecycle.switchPlan,
    createPlan: lifecycle.createPlan,
    syncNow: lifecycle.syncNow,
    persistForCloudSignIn: lifecycle.persistForCloudSignIn,
    activityEvents: lifecycle.activityEvents,
    refreshActivity: lifecycle.refreshActivity,
  };
}
