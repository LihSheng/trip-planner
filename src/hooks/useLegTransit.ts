import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authKind, useAuth } from '../context/AuthContext';
import { useTrip } from '../context/TripContext';
import {
  departureFor,
  isSavedRouteOld,
  latLngOf,
  legAt,
  transitOnSurface,
  type LegRef,
  type LegTransit,
  type TransitProviderId,
  type TransitSurface,
} from '../domain/transit';
import { useI18n } from '../i18n';
import { transitClientFor, type TransitLookupError } from '../lib/transitClient';
import { showUndoableNotification } from '../lib/undoNotification';
import { tripDayDate } from '../utils/date';
import { legGoogleMapsUrl } from '../utils/mapPresentation';
import { resolveLeg, type ResolvedLeg } from '../utils/routing';
import { plannedLeaveMinutes } from '../utils/schedule';

export type TransitRequestState = { status: 'idle' } | { status: 'loading' } | { status: 'failed'; error: TransitLookupError };

export interface LegTransitController {
  /** Null when the leg no longer exists in live state (stops moved while the sheet was open). */
  resolved: ResolvedLeg | null;
  view: LegTransit;
  request: TransitRequestState;
  /** Undefined for read-only trips and share-link guests: the read-only rule lives in the type. */
  refresh: (() => void) | undefined;
  /** Undefined for read-only trips. Arms an undo point, since it changes the leg's minutes. */
  choose: ((signature: string | null) => void) | undefined;
  /** Stale, or on Today when the saved route is older than TODAY_REFRESH_SUGGEST_DAYS. */
  suggestRefresh: boolean;
  /** Whose data a new lookup would show, for the footer when nothing is saved yet. */
  lookupProvider: TransitProviderId | null;
  openRouteUrl: string | null;
}

/** The transit sheet's controller. It reads the leg from live trip state, so remote edits while open stay correct. */
export function useLegTransit(ref: LegRef, surface: TransitSurface): LegTransitController {
  const { state, isReadOnly, saveTransitLookup, chooseTransitRoute, markUndoPoint, undo } = useTrip();
  const { t } = useI18n();
  const auth = useAuth();
  const kind = authKind(auth);
  const client = useMemo(
    () => (isReadOnly ? null : transitClientFor({ kind, accessToken: auth.accessToken })),
    [isReadOnly, kind, auth.accessToken],
  );
  const [request, setRequest] = useState<TransitRequestState>({ status: 'idle' });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const target = legAt(state, ref);
  const resolved = target ? resolveLeg(target.day, state.locationClusters ?? [], target.from, target.to) : null;
  const view: LegTransit = resolved ? transitOnSurface(resolved.transit, surface) : { status: 'ineligible' };

  const lookup = useCallback(async (fresh: boolean) => {
    if (!client || !target) return;
    const departure = departureFor({
      surface,
      timesOn: Boolean(target.day.timeManagementEnabled),
      dayDate: tripDayDate(state.startDate, target.dayIndex),
      leaveMinutes: plannedLeaveMinutes(target.day, target.from),
    });
    setRequest({ status: 'loading' });
    const result = await client.lookup({ from: latLngOf(target.from), to: latLngOf(target.to), departure }, { fresh });
    // Saved even when the sheet has closed: the lookup was paid for, and the mutator rechecks the leg.
    if (result.ok) saveTransitLookup(ref, result.lookup);
    if (mounted.current) setRequest(result.ok ? { status: 'idle' } : { status: 'failed', error: result.error });
  }, [client, target, surface, state.startDate, saveTransitLookup, ref]);

  const canLookUp = Boolean(client) && view.status !== 'ineligible';
  const refresh = canLookUp ? () => { void lookup(true); } : undefined;

  const autoLookedUp = useRef(false);
  useEffect(() => {
    if (autoLookedUp.current || !canLookUp || view.status !== 'empty') return;
    autoLookedUp.current = true;
    void lookup(false);
  }, [canLookUp, view.status, lookup]);

  const choose = isReadOnly || view.status !== 'saved'
    ? undefined
    : (signature: string | null) => {
      const option = view.saved.options.find((candidate) => candidate.signature === signature);
      if (signature !== null && !option) return;
      const title = t(option ? 'transitRouteChosen' : 'transitRouteCleared');
      markUndoPoint(title);
      chooseTransitRoute(ref, signature);
      showUndoableNotification({
        title,
        message: option ? t('transitRouteChosenMessage', { minutes: option.minutes }) : t('transitRouteClearedMessage'),
        onUndo: undo,
        t,
      });
    };

  const suggestRefresh = view.status === 'saved'
    && (view.stale.length > 0 || (surface === 'today' && isSavedRouteOld(view.saved, new Date())));

  return {
    resolved,
    view,
    request,
    refresh,
    choose,
    suggestRefresh,
    lookupProvider: client?.provider ?? null,
    openRouteUrl: target ? legGoogleMapsUrl(target.from, target.to, 'public') : null,
  };
}
