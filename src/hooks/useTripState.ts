import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { ClusterRelationship, ContainerId, CurrencyCode, DayExecutionState, DayTask, FlightBooking, Money, PlaceholderKind, Place, StayBooking, StopExecutionStatus, StopSchedule, TripExpense, TripState, TravelMode } from '../types';
import { movePlace } from '../utils/itinerary';
import { defaultDuration, estimateTravelMinutes, toMinutes, toTime } from '../utils/schedule';
import { markRouteStale, routeLegKey } from '../utils/routing';
import { applyAiDraft as applyConfirmedAiDraft } from '../utils/applyAiDraft';
import type { ConfirmedAiDraft } from '../types/aiImport';
import { ensureActivities, updateActivityDetails, type ActivityDetailUpdates } from '../domain/activity';
import { createInitialState } from '../data/seed';
import { isAccommodation } from '../utils/stay';
import { ensureItineraryEntries } from '../domain/itinerary';
import { isPlaceholder } from '../domain/place';
import { assignPlaceToCluster, clusterForPlace, clusterPlaceIds, removePlacesFromClusters } from '../domain/locationCluster';

interface TripActor {
  id: string;
  email?: string;
}

export function useTripState(readOnly: boolean, actor?: TripActor) {
  const [state, setState] = useState<TripState>(() => ensureActivities(ensureItineraryEntries(createInitialState())));

  const placesById = useMemo(
    () => new Map(state.places.map((place) => [place.id, place])),
    [state.places],
  );

  const activitiesById = useMemo(
    () => new Map((ensureActivities(state).activities ?? []).map((activity) => [activity.id, activity])),
    [state],
  );

  const attributePlace = useCallback((place: Place, importedWithAi = false): Place => {
    if (!actor) return place;
    return {
      ...place,
      createdById: place.createdById ?? actor.id,
      createdByEmail: place.createdByEmail ?? actor.email,
      createdAt: place.createdAt ?? new Date().toISOString(),
      importedWithAi: place.importedWithAi ?? importedWithAi,
    };
  }, [actor]);

  const touchPlace = useCallback((place: Place): Place => {
    if (!actor) return place;
    return { ...place, updatedById: actor.id, updatedByEmail: actor.email, updatedAt: new Date().toISOString() };
  }, [actor]);

  // Older saved trips may share a hotel ID between Unscheduled and a day.
  // Give each day assignment its own ID so dnd-kit can distinguish the cards.
  useEffect(() => {
    setState((current) => {
      const additions: Place[] = [];
      let changed = false;
      const days = current.days.map((day) => {
        const placeIds = day.placeIds.map((placeId) => {
          const place = current.places.find((item) => item.id === placeId);
          if (!place || !isAccommodation(place) || !current.unscheduledIds.includes(placeId)) return placeId;
          const assignment = { ...place, id: `stay-${crypto.randomUUID()}`, assignmentOf: place.id };
          additions.push(assignment);
          changed = true;
          return assignment.id;
        });
        return changed ? { ...day, placeIds } : day;
      });
      return changed ? { ...current, places: [...current.places, ...additions], days } : current;
    });
  }, [state.days, state.places, state.unscheduledIds]);

  const addPlace = useCallback((place: Place) => {
    if (readOnly) return;
    setState((current) => ({
      ...current,
      places: [...current.places, attributePlace(place)],
      unscheduledIds: [...current.unscheduledIds, place.id],
      hotelPlaceId: isAccommodation(place) ? place.id : current.hotelPlaceId,
    }));
  }, [readOnly]);

  const addPlaceToDay = useCallback((place: Place, dayId: string) => {
    if (readOnly) return;
    setState((current) => ({
      ...current,
      places: [...current.places, attributePlace(place)],
      days: current.days.map((day) => (day.id === dayId ? markRouteStale({ ...day, placeIds: [...day.placeIds, place.id] }) : day)),
      hotelPlaceId: isAccommodation(place) ? place.id : current.hotelPlaceId,
    }));
  }, [readOnly]);

  const addPlaceholderToDay = useCallback((dayId: string, kind: PlaceholderKind) => {
    if (readOnly) return;
    const placeholder: Place = { id: `placeholder-${crypto.randomUUID()}`, name: kind, region: '', category: 'Relaxation', latitude: 0, longitude: 0, notes: '', placeholderKind: kind };
    setState((current) => ({
      ...current,
      places: [...current.places, attributePlace(placeholder)],
      days: current.days.map((day) => day.id === dayId ? markRouteStale({ ...day, placeIds: [...day.placeIds, placeholder.id] }) : day),
    }));
  }, [readOnly]);

  const replacePlaceholder = useCallback((placeholderId: string, place: Place) => {
    if (readOnly) return;
    setState((current) => ({
      ...current,
      places: [...current.places.filter((item) => item.id !== placeholderId), attributePlace(place)],
      days: current.days.map((day) => day.placeIds.includes(placeholderId)
        ? markRouteStale({ ...day, placeIds: day.placeIds.map((id) => id === placeholderId ? place.id : id) })
        : day),
    }));
  }, [readOnly]);

  const fillPlaceholder = useCallback((placeholderId: string, placeId: string) => {
    if (readOnly) return;
    setState((current) => {
      const placeholder = current.places.find((place) => place.id === placeholderId);
      const place = current.places.find((item) => item.id === placeId);
      if (!placeholder || !isPlaceholder(placeholder) || !place || isPlaceholder(place)) return current;
      return {
        ...current,
        places: current.places.filter((item) => item.id !== placeholderId),
        unscheduledIds: current.unscheduledIds.filter((id) => id !== placeId),
        days: current.days.map((day) => {
          if (day.placeIds.includes(placeholderId)) return markRouteStale({ ...day, placeIds: day.placeIds.filter((id) => id !== placeId).map((id) => id === placeholderId ? placeId : id) });
          return day.placeIds.includes(placeId) ? markRouteStale({ ...day, placeIds: day.placeIds.filter((id) => id !== placeId) }) : day;
        }),
      };
    });
  }, [readOnly]);

  const updatePlace = useCallback((place: Place) => {
    if (readOnly) return;
    setState((current) => ({
      ...current,
      places: current.places.map((item) => (item.id === place.id ? touchPlace(place) : item)),
      days: current.days.map((day) => day.placeIds.includes(place.id) ? markRouteStale(day) : day),
      hotelPlaceId: isAccommodation(place) ? place.id : current.hotelPlaceId === place.id ? undefined : current.hotelPlaceId,
    }));
  }, [readOnly, touchPlace]);

  const updateActivity = useCallback((activityId: string, updates: ActivityDetailUpdates) => {
    if (readOnly) return;
    setState((current) => {
      const activity = current.activities?.find((item) => item.id === activityId);
      const next = updateActivityDetails(current, activityId, updates);
      if (!activity?.placeId) return next;
      return { ...next, places: next.places.map((place) => place.id === activity.placeId ? touchPlace(place) : place) };
    });
  }, [readOnly, touchPlace]);

  const removePlace = useCallback((placeId: string) => {
    if (readOnly) return;
    setState((current) => {
      const removedIds = new Set(
        current.places
          .filter((place) => place.id === placeId || place.assignmentOf === placeId)
          .map((place) => place.id),
      );
      return {
        ...current,
        places: current.places.filter((place) => !removedIds.has(place.id)),
        locationClusters: removePlacesFromClusters(current, removedIds),
        unscheduledIds: current.unscheduledIds.filter((id) => !removedIds.has(id)),
        visitedPlaceIds: current.visitedPlaceIds.filter((id) => !removedIds.has(id)),
        hotelPlaceId: current.hotelPlaceId === placeId ? undefined : current.hotelPlaceId,
        days: current.days.map((day) => markRouteStale({
          ...day,
          placeIds: day.placeIds.filter((id) => !removedIds.has(id)),
          lodgingPlaceId: day.lodgingPlaceId && removedIds.has(day.lodgingPlaceId) ? undefined : day.lodgingPlaceId,
        })),
      };
    });
  }, [readOnly]);

  const removePlannerVisit = useCallback((placeId: string, dayId: string) => {
    if (readOnly) return;
    setState((current) => {
      const place = current.places.find((item) => item.id === placeId);
      const day = current.days.find((item) => item.id === dayId);
      if (!place || !day?.placeIds.includes(placeId)) return current;

      const removesPlaceRecord = Boolean(place.assignmentOf) || isPlaceholder(place);
      return {
        ...current,
        places: removesPlaceRecord ? current.places.filter((item) => item.id !== placeId) : current.places,
        unscheduledIds: removesPlaceRecord || current.unscheduledIds.includes(placeId)
          ? current.unscheduledIds
          : [...current.unscheduledIds, placeId],
        days: current.days.map((item) => item.id === dayId
          ? markRouteStale({ ...item, placeIds: item.placeIds.filter((id) => id !== placeId) })
          : item),
      };
    });
  }, [readOnly]);

  const addDay = useCallback(() => {
    if (readOnly) return;
    setState((current) => {
      const dayNumber = current.days.length + 1;
      return {
        ...current,
        days: [
          ...current.days,
          { id: `day-${crypto.randomUUID()}`, label: `Day ${dayNumber}`, placeIds: [], travelMode: 'public', stopSchedules: {}, timeManagementEnabled: false },
        ],
      };
    });
  }, [readOnly]);

  const updateDayLabel = useCallback((dayId: string, label: string) => {
    if (readOnly) return;
    setState((current) => ({
      ...current,
      days: current.days.map((day) => (day.id === dayId ? { ...day, label } : day)),
    }));
  }, [readOnly]);

  const removeDay = useCallback((dayId: string) => {
    if (readOnly) return;
    setState((current) => {
      const day = current.days.find((item) => item.id === dayId);
      const removedIndex = current.days.findIndex((item) => item.id === dayId);
      const remainingDays = current.days.filter((item) => item.id !== dayId);
      const destination = remainingDays[removedIndex] ?? remainingDays[removedIndex - 1];
      const destinationTaskCount = (current.dayTasks ?? []).filter((task) => task.dayId === destination?.id).length;
      let movedTaskIndex = 0;
      return {
        ...current,
        unscheduledIds: [...current.unscheduledIds, ...(day?.placeIds ?? [])],
        days: remainingDays,
        dayTasks: (current.dayTasks ?? []).flatMap((task) => {
          if (task.dayId !== dayId) return [task];
          if (!destination) return [];
          return [{ ...task, dayId: destination.id, sortOrder: destinationTaskCount + movedTaskIndex++ }];
        }),
      };
    });
  }, [readOnly]);

  const addDayTask = useCallback((dayId: string, text: string) => {
    if (readOnly || !text.trim()) return;
    setState((current) => {
      if (!current.days.some((day) => day.id === dayId)) return current;
      const sortOrder = (current.dayTasks ?? []).filter((task) => task.dayId === dayId).length;
      const task: DayTask = { id: `task-${crypto.randomUUID()}`, dayId, text: text.trim(), completed: false, sortOrder };
      return { ...current, dayTasks: [...(current.dayTasks ?? []), task] };
    });
  }, [readOnly]);

  const updateDayTask = useCallback((taskId: string, text: string) => {
    if (readOnly || !text.trim()) return;
    setState((current) => ({
      ...current,
      dayTasks: (current.dayTasks ?? []).map((task) => task.id === taskId ? { ...task, text: text.trim() } : task),
    }));
  }, [readOnly]);

  const toggleDayTask = useCallback((taskId: string) => {
    if (readOnly) return;
    setState((current) => ({
      ...current,
      dayTasks: (current.dayTasks ?? []).map((task) => task.id === taskId ? { ...task, completed: !task.completed } : task),
    }));
  }, [readOnly]);

  const deleteDayTask = useCallback((taskId: string) => {
    if (readOnly) return;
    setState((current) => ({ ...current, dayTasks: (current.dayTasks ?? []).filter((task) => task.id !== taskId) }));
  }, [readOnly]);

  const reorderDayTasks = useCallback((dayId: string, activeId: string, overId: string) => {
    if (readOnly || activeId === overId) return;
    setState((current) => {
      const all = current.dayTasks ?? [];
      const tasks = all.filter((task) => task.dayId === dayId).sort((a, b) => a.sortOrder - b.sortOrder);
      const from = tasks.findIndex((task) => task.id === activeId);
      const to = tasks.findIndex((task) => task.id === overId);
      if (from < 0 || to < 0) return current;
      const reordered = [...tasks];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      const byId = new Map(reordered.map((task, sortOrder) => [task.id, { ...task, sortOrder }]));
      return { ...current, dayTasks: all.map((task) => byId.get(task.id) ?? task) };
    });
  }, [readOnly]);

  const moveDayTask = useCallback((taskId: string, dayId: string) => {
    if (readOnly) return;
    setState((current) => {
      if (!current.days.some((day) => day.id === dayId)) return current;
      const sortOrder = (current.dayTasks ?? []).filter((task) => task.dayId === dayId).length;
      return {
        ...current,
        dayTasks: (current.dayTasks ?? []).map((task) => task.id === taskId ? { ...task, dayId, sortOrder } : task),
      };
    });
  }, [readOnly]);

  const reorderDays = useCallback((fromIndex: number, toIndex: number) => {
    if (readOnly) return;
    setState((current) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= current.days.length ||
        toIndex >= current.days.length
      ) {
        return current;
      }
      const days = [...current.days];
      const [movedDay] = days.splice(fromIndex, 1);
      days.splice(toIndex, 0, movedDay);
      return { ...current, days };
    });
  }, [readOnly]);

  const updateDaySchedule = useCallback((dayId: string, updates: { travelMode?: TravelMode; startTime?: string; lodgingPlaceId?: string; timeManagementEnabled?: boolean }) => {
    if (readOnly) return;
    setState((current) => {
      const placesById = new Map(current.places.map((place) => [place.id, place]));
      return {
        ...current,
        days: current.days.map((day) => {
          if (day.id !== dayId) return day;
          const firstPlaceId = day.placeIds[0];
          const firstPlace = firstPlaceId ? placesById.get(firstPlaceId) : undefined;
          const stopSchedules = { ...day.stopSchedules };
          if (updates.startTime && firstPlace && !stopSchedules[firstPlace.id]?.startTime) {
            stopSchedules[firstPlace.id] = { ...stopSchedules[firstPlace.id], startTime: updates.startTime, durationMinutes: defaultDuration(firstPlace.category) };
          }
          return markRouteStale({ ...day, ...updates, stopSchedules });
        }),
      };
    });
  }, [readOnly]);

  const updateStopSchedule = useCallback((dayId: string, placeId: string, updates: StopSchedule) => {
    if (readOnly) return;
    setState((current) => {
      const placesById = new Map(current.places.map((place) => [place.id, place]));
      return {
        ...current,
        places: current.places.map((place) => place.id === placeId ? touchPlace(place) : place),
        days: current.days.map((day) => {
          if (day.id !== dayId) return day;
          const stopSchedules = { ...day.stopSchedules, [placeId]: { ...day.stopSchedules?.[placeId], ...updates } };
          const startIndex = day.placeIds.indexOf(placeId);
          const firstPlace = placesById.get(placeId);
          let nextStart = firstPlace && toMinutes(stopSchedules[placeId].startTime);
          let previousPlace = firstPlace;
          if (nextStart !== null && nextStart !== undefined && previousPlace && startIndex >= 0) {
            nextStart += stopSchedules[placeId].durationMinutes ?? defaultDuration(previousPlace.category);
            for (const nextPlaceId of day.placeIds.slice(startIndex + 1)) {
              const nextPlace = placesById.get(nextPlaceId);
              if (!nextPlace) continue;
              nextStart += estimateTravelMinutes(previousPlace, nextPlace, day.travelMode);
              if (stopSchedules[nextPlaceId]?.startTime) break;
              stopSchedules[nextPlaceId] = { ...stopSchedules[nextPlaceId], startTime: toTime(nextStart), durationMinutes: stopSchedules[nextPlaceId]?.durationMinutes ?? defaultDuration(nextPlace.category) };
              nextStart += stopSchedules[nextPlaceId].durationMinutes ?? defaultDuration(nextPlace.category);
              previousPlace = nextPlace;
            }
          }
          return markRouteStale({ ...day, stopSchedules });
        }),
      };
    });
  }, [readOnly, touchPlace]);

  const toggleVisited = useCallback((placeId: string) => {
    if (readOnly) return;
    setState((current) => ({
      ...current,
      visitedPlaceIds: current.visitedPlaceIds.includes(placeId)
        ? current.visitedPlaceIds.filter((id) => id !== placeId)
        : [...current.visitedPlaceIds, placeId],
    }));
  }, [readOnly]);

  const updateExecution = useCallback((dayId: string, placeId: string, status: StopExecutionStatus) => {
    if (readOnly) return;
    setState((current) => {
      const day = current.days.find((item) => item.id === dayId);
      if (!day || !day.placeIds.includes(placeId)) return current;
      const now = new Date().toISOString();
      const previous = current.executionByDay?.[dayId];
      const stopStates = { ...(previous?.stopStates ?? {}) };
      const currentState = stopStates[placeId] ?? { placeId, status: 'upcoming' as const };

      if (status === 'current') {
        Object.entries(stopStates).forEach(([id, item]) => {
          if (id !== placeId && item.status === 'current') stopStates[id] = { ...item, status: 'upcoming' };
        });
      }
      stopStates[placeId] = {
        ...currentState,
        status,
        arrivedAt: status === 'current' ? now : currentState.arrivedAt,
        completedAt: status === 'completed' ? now : currentState.completedAt,
        skippedAt: status === 'skipped' ? now : currentState.skippedAt,
      };

      if (status === 'completed' || status === 'skipped') {
        const nextId = day.placeIds.find((id) => id !== placeId && !['completed', 'skipped', 'rescheduled'].includes(stopStates[id]?.status ?? 'upcoming'));
        if (nextId) stopStates[nextId] = { ...(stopStates[nextId] ?? { placeId: nextId }), status: 'current', arrivedAt: now };
      }

      const execution: DayExecutionState = { dayId, selectedAt: previous?.selectedAt ?? now, stopStates, updatedAt: now };
      return { ...current, executionByDay: { ...current.executionByDay, [dayId]: execution } };
    });
  }, [readOnly]);

  const addExpense = useCallback((expense: TripExpense) => {
    if (readOnly) return;
    setState((current) => ({ ...current, expenses: [...(current.expenses ?? []), expense] }));
  }, [readOnly]);

  const updateExpense = useCallback((expense: TripExpense) => {
    if (readOnly) return;
    setState((current) => ({ ...current, expenses: (current.expenses ?? []).map((item) => item.id === expense.id ? expense : item) }));
  }, [readOnly]);

  const deleteExpense = useCallback((expenseId: string) => {
    if (readOnly) return;
    setState((current) => ({ ...current, expenses: (current.expenses ?? []).filter((item) => item.id !== expenseId) }));
  }, [readOnly]);

  const saveStayBooking = useCallback((booking: StayBooking) => {
    if (readOnly) return;
    setState((current) => ({
      ...current,
      stayBookings: (current.stayBookings ?? []).some((item) => item.id === booking.id)
        ? (current.stayBookings ?? []).map((item) => item.id === booking.id ? booking : item)
        : [...(current.stayBookings ?? []), booking],
      places: booking.id.startsWith(`legacy-stay:${booking.placeId}:`)
        ? current.places.map((place) => place.id === booking.placeId ? { ...place, stay: { checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate } } : place)
        : current.places,
    }));
  }, [readOnly]);

  const deleteStayBooking = useCallback((bookingId: string) => {
    if (readOnly) return;
    setState((current) => {
      const booking = current.stayBookings?.find((item) => item.id === bookingId);
      return {
        ...current,
        stayBookings: (current.stayBookings ?? []).filter((item) => item.id !== bookingId),
        places: bookingId.startsWith('legacy-stay:') && booking
          ? current.places.map((place) => place.id === booking.placeId ? { ...place, stay: undefined } : place)
          : current.places,
      };
    });
  }, [readOnly]);

  const saveFlightBooking = useCallback((booking: FlightBooking) => {
    if (readOnly) return;
    setState((current) => ({
      ...current,
      flightBookings: (current.flightBookings ?? []).some((item) => item.id === booking.id)
        ? (current.flightBookings ?? []).map((item) => item.id === booking.id ? booking : item)
        : [...(current.flightBookings ?? []), booking],
    }));
  }, [readOnly]);

  const deleteFlightBooking = useCallback((bookingId: string) => {
    if (readOnly) return;
    setState((current) => ({ ...current, flightBookings: (current.flightBookings ?? []).filter((item) => item.id !== bookingId) }));
  }, [readOnly]);

  const updateBudget = useCallback((budget?: Money) => {
    if (readOnly) return;
    setState((current) => ({ ...current, budget }));
  }, [readOnly]);

  const move = useCallback(
    (placeId: string, destinationId: ContainerId, destinationIndex: number) => {
      if (readOnly) return;
      setState((current) => {
        const place = current.places.find((item) => item.id === placeId);
        if (destinationId === 'unscheduled' && place && isPlaceholder(place)) return current;
        if (place && isAccommodation(place)) {
          if (destinationId === 'unscheduled') return current;
          const targetDay = current.days.find((day) => day.id === destinationId);
          if (!targetDay) return current;

          const sourceDay = current.days.find((day) => day.placeIds.includes(placeId));
          const isReusableSource = current.unscheduledIds.includes(placeId) && !sourceDay;
          if (isReusableSource) {
            const duplicate = { ...place, id: `stay-${crypto.randomUUID()}`, assignmentOf: place.id };
            const targetPlaceIds = [...targetDay.placeIds];
            targetPlaceIds.splice(Math.max(0, Math.min(destinationIndex, targetPlaceIds.length)), 0, duplicate.id);
            return {
              ...current,
              places: [...current.places, duplicate],
              days: current.days.map((day) => day.id === destinationId
                ? markRouteStale({ ...day, placeIds: targetPlaceIds, lodgingPlaceId: placeId })
                : day),
            };
          }

          // A legacy trip can put the reusable hotel ID in a day too. Convert it
          // to an occurrence before moving so its Unscheduled source stays unique.
          const occurrenceId = place.assignmentOf
            ? placeId
            : `stay-${crypto.randomUUID()}`;
          const occurrence = place.assignmentOf
            ? undefined
            : { ...place, id: occurrenceId, assignmentOf: place.id };
          const targetPlaceIds = targetDay.placeIds.filter((id) => id !== placeId);
          // destinationIndex already uses the original list's target position.
          // Keep it after removal so dropping over the last card places this card last.
          targetPlaceIds.splice(Math.max(0, Math.min(destinationIndex, targetPlaceIds.length)), 0, occurrenceId);
          return {
            ...current,
            places: occurrence ? [...current.places, occurrence] : current.places,
            days: current.days.map((day) => {
              if (day.id === destinationId) {
                return markRouteStale({
                  ...day,
                  placeIds: targetPlaceIds,
                  lodgingPlaceId: place.assignmentOf ?? place.id,
                });
              }
              if (day.id === sourceDay?.id) {
                return markRouteStale({ ...day, placeIds: day.placeIds.filter((id) => id !== placeId) });
              }
              return day;
            }),
          };
        }
        const cluster = clusterForPlace(current.locationClusters, placeId);
        if (cluster?.anchorPlaceId === placeId) {
          const sourceId = current.unscheduledIds.includes(placeId)
            ? 'unscheduled'
            : current.days.find((day) => day.placeIds.includes(placeId))?.id;
          const movingIds = clusterPlaceIds(cluster).filter((id) => sourceId && (
            sourceId === 'unscheduled'
              ? current.unscheduledIds.includes(id)
              : current.days.find((day) => day.id === sourceId)?.placeIds.includes(id)
          ));
          let clustered = current;
          movingIds.forEach((id, index) => {
            clustered = movePlace(clustered, id, destinationId, destinationIndex + index);
          });
          return { ...clustered, days: clustered.days.map(markRouteStale) };
        }
        const moved = movePlace(current, placeId, destinationId, destinationIndex);
        return { ...moved, days: moved.days.map(markRouteStale) };
      });
    },
    [readOnly],
  );

  const setPlaceCluster = useCallback((placeId: string, targetPlaceId?: string, relationship: ClusterRelationship = 'walkable', travelMinutes?: number, travelMode?: TravelMode) => {
    if (readOnly) return;
    setState((current) => assignPlaceToCluster(
      current,
      placeId,
      targetPlaceId ? { targetPlaceId, relationship, travelMinutes, travelMode } : undefined,
    ));
  }, [readOnly]);

  const renameLocationCluster = useCallback((clusterId: string, name: string) => {
    if (readOnly || !name.trim()) return;
    setState((current) => ({
      ...current,
      locationClusters: (current.locationClusters ?? []).map((cluster) => cluster.id === clusterId ? { ...cluster, name: name.trim() } : cluster),
    }));
  }, [readOnly]);

  const ungroupLocationCluster = useCallback((clusterId: string) => {
    if (readOnly) return;
    setState((current) => ({ ...current, locationClusters: (current.locationClusters ?? []).filter((cluster) => cluster.id !== clusterId) }));
  }, [readOnly]);

  const replaceLocationClusterAnchor = useCallback((clusterId: string, anchorPlaceId: string) => {
    if (readOnly) return;
    setState((current) => ({
      ...current,
      locationClusters: (current.locationClusters ?? []).map((cluster) => {
        if (cluster.id !== clusterId || !cluster.members.some((member) => member.placeId === anchorPlaceId)) return cluster;
        return {
          ...cluster,
          anchorPlaceId,
          name: cluster.name,
          members: [
            { placeId: cluster.anchorPlaceId, relationship: 'inside' as const },
            ...cluster.members.filter((member) => member.placeId !== anchorPlaceId),
          ],
        };
      }),
    }));
  }, [readOnly]);

  const updateTrip = useCallback((tripName: string, startDate: string, displayCurrency?: CurrencyCode) => {
    if (readOnly) return;
    setState((current) => ({ ...current, tripName, startDate, displayCurrency: displayCurrency ?? current.displayCurrency ?? 'MYR', days: current.days.map(markRouteStale) }));
  }, [readOnly]);

  const updateLegMode = useCallback((dayId: string, fromPlaceId: string, toPlaceId: string, mode: TravelMode | 'default') => {
    if (readOnly) return;
    const key = routeLegKey(fromPlaceId, toPlaceId);
    setState((current) => ({
      ...current,
      days: current.days.map((day) => day.id === dayId
        ? markRouteStale({ ...day, legModeOverrides: { ...day.legModeOverrides, [key]: mode } })
        : day),
    }));
  }, [readOnly]);

  const applyAiDraft = useCallback((draft: ConfirmedAiDraft) => {
    if (readOnly) return;
    setState((current) => {
      const next = applyConfirmedAiDraft(current, draft);
      const existingIds = new Set(current.places.map((place) => place.id));
      return { ...next, places: next.places.map((place) => existingIds.has(place.id) ? place : attributePlace(place, true)) };
    });
  }, [attributePlace, readOnly]);

  const reset = useCallback(() => {
    if (!readOnly) setState(ensureActivities(ensureItineraryEntries(createInitialState())));
  }, [readOnly]);

  return {
    state,
    setState: setState as Dispatch<SetStateAction<TripState>>,
    placesById,
    activitiesById,
    addPlace,
    addPlaceToDay,
    addPlaceholderToDay,
    replacePlaceholder,
    fillPlaceholder,
    updatePlace,
    updateActivity,
    removePlace,
    removePlannerVisit,
    addDay,
    updateDayLabel,
    updateDaySchedule,
    updateStopSchedule,
    removeDay,
    addDayTask,
    updateDayTask,
    toggleDayTask,
    deleteDayTask,
    reorderDayTasks,
    moveDayTask,
    reorderDays,
    toggleVisited,
    updateExecution,
    addExpense,
    updateExpense,
    deleteExpense,
    saveStayBooking,
    deleteStayBooking,
    saveFlightBooking,
    deleteFlightBooking,
    updateBudget,
    move,
    setPlaceCluster,
    renameLocationCluster,
    ungroupLocationCluster,
    replaceLocationClusterAnchor,
    updateTrip,
    updateLegMode,
    applyAiDraft,
    reset,
  };
}
