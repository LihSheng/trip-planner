# Transit options: design sketch (synthesized)

Base is arena candidate A. The deltas in "Synthesis decision" override the body below wherever they disagree.

## Problem

Each public-transport leg needs real TDX transit options. The user picks one, and its minutes must then drive every surface. Six constraints make the shape non-obvious.

1. Leg minutes come from two paths today. `resolveLeg` feeds chips, totals, map and `nextAnchor`. `dayWarnings`, the PlaceCard "~N min travel" and the `updateStopSchedule` cascade skip it and call `estimateTravelMinutes(prev, next, day.travelMode)` directly. A chosen route that reaches only one path makes the surfaces disagree.
2. The trip is one JSONB document with a recursive 3-way merge. Records merge per key and recurse into nested records. Arrays of objects that carry `id` merge by id; other arrays conflict as a whole. A per-leg record whose fields depend on each other, such as a chosen index into an options array, can come out of a merge inconsistent.
3. Leg keys are `"from:to"` place ids, and hotel occurrences change ids when moved. Nothing prunes orphan keys.
4. Share-link viewers are anonymous, so they cannot call a JWT function (assumption A). Demo mode runs offline on a mock.
5. TDX has a shared limit of 5 calls per minute per key. Its response `sections` are undocumented until we record a fixture. Its `depart` value is Taipei-local and must not be in the past.
6. A dead `routeLegs`, `routeStale`, `routeUpdatedAt` and `routeError` scaffold makes ~15 mutators call a no-op `markRouteStale`.

## Usage (caller's view)

README for a contributor touching legs:

> A leg's minutes come from `resolveLeg(day, clusters, from, to).minutes`. Nothing else is allowed to estimate leg time. If the leg is public transport, not inside a venue, and has a chosen saved route, that route's minutes win. `leg.transit` tells you whether the leg can show transit and what is saved. To show transit for a leg, call `openTransit({ dayId, fromPlaceId, toPlaceId })` from `useTransitSheet()`. The sheet does the fetching, saving, choosing, quota errors and attribution. You never call the lookup client or the trip mutators yourself.

Call site 1, the planner leg row (`DayColumn.tsx`), with collapsed legs included:

```tsx
const { openTransit } = useTransitSheet();
const leg = legs[placeIndex];                       // legs = dayLegs(...) computed once above
const transitRef = { dayId: day.id, fromPlaceId: leg.from.id, toPlaceId: leg.to.id };
const onOpenTransit = leg.transit.status === 'ineligible' ? undefined : () => openTransit(transitRef);

showChip
  ? <TransportLegChip leg={leg} dayDefaultMode={dayDefaultMode} readOnly={readOnly}
      onChange={(mode) => onLegModeChange(day.id, leg.from.id, leg.to.id, mode)}
      onOpenTransit={onOpenTransit} />
  : onOpenTransit ? <LegMinutesButton leg={leg} onClick={onOpenTransit} /> : null;   // collapsed row

// PlaceCard: same number as the chip, no second estimate
travelMinutes={placeIndex > 0 && ... ? legs[placeIndex - 1].minutes : undefined}
```

Call site 2, Today's leave-by line (`TodayModePage.tsx`):

```tsx
const anchor = nextAnchor(activeDay, clusters, stops, current?.id ?? null, next?.id ?? null);
{anchor.kind === 'leaveBy' && anchor.leg && anchor.leg.transit.status !== 'ineligible' ? (
  <Anchor component="button" size="sm" onClick={() => openTransit(anchor.legRef, { surface: 'today' })}>
    {t('showTransit')}{anchor.leg.transit.status === 'saved' && isOlderThanDays(anchor.leg.transit.saved.fetchedAt, 7, now) ? ` · ${t('transitRefreshSuggested')}` : ''}
  </Anchor>
) : null}
```

Call site 3, inside the sheet (`TransitSheet.tsx`). This is the only consumer of the controller:

```tsx
const leg = useLegTransit(ref, surface);
if (!leg.resolved) return <Text>{t('transitLegGone')}</Text>;      // stops reordered while the sheet was open
leg.view.status === 'saved' && leg.view.stale.length > 0 && <StaleNotice reasons={leg.view.stale} onRefresh={leg.refresh} />;
leg.request.status === 'failed' && <Text c="red">{t(ERROR_KEY[leg.request.error.kind])}</Text>;  // limitReached | busy | offline | unavailable
options.map((o) => <OptionCard option={o} chosen={o.signature === chosenSignature} onChoose={leg.choose && (() => leg.choose!(o.signature))} />);
<Attribution provider={leg.view.provider} />  <Anchor href={leg.openRouteUrl}>{t('openRoute')}</Anchor>
```

Call site 4, the start-time cascade (`useTripState.updateStopSchedule`):

```ts
nextStart += resolveLeg(day, current.locationClusters ?? [], previousPlace, nextPlace).minutes ?? 0;
```

## Shape

### Data: `day.transitByLeg: Record<legKey, SavedLegTransit>`

```ts
interface SavedLegTransit {
  provider: 'tdx' | 'mock';
  fetchedAt: string;                 // ISO instant
  basis: { from: LatLng; to: LatLng; departAt: TaipeiDateTime };  // what was actually queried
  options: TransitOption[];          // fastest first, unique by signature, may be []
  chosen?: string;                   // a TransitOption.signature
}
```

Load-bearing decisions:

- **Choice by content signature, not index or uuid.** `signature` is the ride sequence, such as `metro:淡水信義線>bus:307`, and walk-only is `walk`. Three properties follow. (a) A refresh that returns the same lines keeps the choice and updates its minutes for free. (b) When collaborator A refreshes while B chooses, the 3-way merge recurses into the record and takes A's `options` and B's `chosen`. The choice is then still valid if that route still exists, and it is dropped on read if it doesn't. (c) The field is named `signature`, not `id`, on purpose, so `mergeKeyedArray` never merges `options` element by element. A concurrent double-refresh conflicts on the whole `options` array instead of producing a mixed array. The invariant `chosen ∈ options[].signature` is checked by derivation at read (`legTransit`), not kept in sync. Per separate-before-serializing-shared-state and "derive instead of sync".
- **Minutes are not stored.** Chosen minutes are `options.find(sig).minutes`, so the trip has one number per route, not two.
- **Staleness is derived, never stored.** Stale reasons are `fromMoved` and `toMoved` (coordinates differ from `basis` by more than ~25 m) and `departureShifted`. `departureShifted` means the day has Times on and the from-stop's planned leave time, start plus duration, differs from `basis.departAt`'s time of day by more than 30 minutes. Only the time of day is compared. A far-future trip queried on a nearby same weekday (see the edge function's depart policy) therefore isn't stale. With Times off, the departure never goes stale. Per ADR 11, with no auto-refetch.
- **Stale chosen routes keep driving minutes**, with a badge and Refresh (assumption B).
- **Switching a leg away from public keeps the record.** Eligibility is derived, so the route ignores the record while the mode is something else. Switching back restores the route. Mode changes delete nothing.
- **Orphan pruning.** A key survives while both its place ids are still in `day.placeIds`, even if they are no longer adjacent. A reorder followed by an undo reorder therefore keeps the route, and a removed stop or a regenerated `stay-<uuid>` drops it. Pruning runs in `normalizeTripState` (load) and in the per-write normalizer that already runs `normalizeFlexibleWindows`, which becomes `normalizeOnWrite`. It returns the same `day` object when nothing is pruned, so the merger sees no change.
- **Dead scaffolding is deleted outright.** That covers `RouteLeg`, `RouteStep`, `RouteStepKind`, the four `route*` fields on `TripDay`, `markRouteStale` and all ~15 call sites, `isRouteCurrent`, `effectiveLegMode`, the TaiwanMap stale banner, and the `routeStale*`, `routeError`, `routeReady`, `routeDemo` and `refreshRoute` strings. `normalizeTripState` strips the four fields from old JSON. The merger handles that as a one-sided removal, so no conflict follows.

### Single source of leg minutes

`resolveLeg` keeps its signature `(day, clusters, from, to)` because the routes live on `day`. It gains `transit: LegTransit`, `minutesSource` and `key`. Minutes precedence:

1. A chosen transit route on an eligible leg.
2. Cluster member minutes.
3. The straight-line estimate.
4. `undefined` for placeholders.

The three bypasses move onto it:

- `dayWarnings(day, places, clusters)` sums resolved leg minutes along the path between consecutive timed stops. Today it uses a straight line from the last timed stop and ignores overrides. Intermediate untimed stop durations are still ignored, as now.
- The PlaceCard reads `legs[i-1].minutes`.
- The cascade calls `resolveLeg` with `current.locationClusters`.

`nextAnchor` already goes through `resolveLeg`. It now also returns `leg` and `legRef` so Today can offer "Show transit". `estimateTravelMinutes` stays exported for `resolveLeg` and for tests only. The note covering that sits next to it, and a later lint or grep test can enforce it.

Choosing a route doesn't re-run the cascade. That matches today's mode change, which doesn't either. The warnings surface the gap instead.

### Client lookup: `TransitClient` + `useLegTransit` + `TransitSheet`

- `src/lib/transitClient.ts` has one interface, `lookup(request) → Promise<TransitLookupResult>`. Expected failures come back as a discriminated union (`limitReached` with `resetsAt` | `busy` | `offline` | `unavailable`) and never throw. `transitClientFor(auth)` picks the client: TDX through the edge function for signed-in users, the mock for demo, `null` for share viewers. The session cache is a module-level `Map<basisKey, Promise<result>>`. It keeps only `ok` results, it doesn't key on language because names are provider-verbatim (decision 13), and it dedupes double-taps and re-opens before the trip save lands. The trip itself is the durable cache.
- The departure rule (ADR 4) is the pure `departureFor`. Today mode, or Times off, or no planned time uses now. Otherwise it uses the trip-day date plus the from-stop's planned leave time, and a past time becomes now. "Now" is Taipei time rounded up to the next 5 minutes so the request never lands in the past.
- `useLegTransit(ref, surface)` is the controller. It resolves the leg from live state, so a sheet left open across remote edits stays correct. It auto-looks-up once on open when the leg is eligible, nothing is saved and a client exists, because the tap is the intent. It never auto-refetches stale data. It saves results through `saveTransitLookup` and choices through `chooseTransitRoute`. Each one arms an undo point, because both can change leg minutes. For viewers it returns `refresh: undefined` and `choose: undefined`, so the read-only rule is encoded in the type rather than in an `if`.
- `TransitSheetProvider` mounts one modal for the app. `useTransitSheet().openTransit(ref, opts?)` is the only entry point. That replaces the per-chip modal instances in the prototype.

### Server: `transit-routes` edge function + ledger

- Requests are POST `{ from, to, departAt }` and responses are `{ version: 1, departAt, fetchedAt, options }`. There is no `planId`. Transit is a user-scoped capability, the cap is per user, and dropping the RLS read saves a query per call.
- The order of work is: auth, then `parseRequest` (Taiwan bounding box, departure format, clamp to now if in the past), then `reserve_transit_usage`, then a TDX call with a cached token, then `adaptTdxRouting`, then a ledger update, then the response.
- The ledger keeps `ai_import_usage` (per ADR 8) with `source_type = 'transit'` and `model = 'tdx-maas-routing'`. `reserve_ai_import_usage` is patched to count only `text` and `url`, which keeps the pools separate. The new `reserve_transit_usage` returns `reserved`, `limit` (with `resets_at`) or `busy`. `busy` is a **global** count of transit calls in the last 60 seconds, checked under one advisory lock, so we answer "Busy, try again in a minute" before TDX ever sees the call. TDX 429 maps to `busy` as well.
- Only `started` and `completed` count. Busy, provider failures and adapter failures are marked `failed` and refunded, so the user's 30 isn't spent on our errors.
- The token source caches in module scope with in-flight dedupe and refreshes 5 minutes before expiry. On a routing 401 it is invalidated and the call is retried once. The secrets are `TDX_CLIENT_ID` and `TDX_CLIENT_SECRET`.
- The adapter is pure and tolerant. Unknown mode codes become `other`. A route with an unparseable section is dropped, not the whole response. A non-empty response with zero parsable routes throws `AdapterShapeError` (502 `PROVIDER_RESPONSE_INVALID`) and logs a truncated raw sample with the `requestId`. A recorded fixture plus `node --test` pins it. A vitest contract test runs the edge adapter over the fixture and feeds the output through the client's `parseTransitRoutesResponse`. A type-equality assertion fails the typecheck when the edge type `TransitOptionV1` and `Omit<TransitOption, 'signature'>` diverge. This is the hand-synced-list mitigation.

### UI eligibility and attribution

The domain has one predicate, `isTransitEligible(mode, inside, from, to)`: resolved mode `public`, not inside a venue, neither end a placeholder, and both ends in the Taiwan bounding box. The chip menu item, the tappable minutes, the collapsed-row button and Today's link all key off `leg.transit.status !== 'ineligible'`. Viewers get the same entry points. With nothing saved, their sheet shows "No saved route yet" and the Open route link. The attribution line 「交通部運輸資料流通服務平臺」 is rendered by the sheet whenever any option from `provider: 'tdx'` is visible. The mock shows "Sample data" instead.

### Interface depth

The public surface for UI code is `resolveLeg` (existing), `openTransit(ref)` and the read-only `leg.transit`. Behind it sit the departure rule, the auth-to-client mapping, the session cache, quota and busy mapping, signature-based choice preservation, staleness, pruning, merge safety and attribution. Components never see TDX shapes, `departAt` strings or ledger codes.

## Synthesis decision

Arena with two runners (Opus, Fable) and a Sonnet cross-judge, 2026-10-19. The judge and the parent independently picked candidate A as the base. A works the 3-way merge explicitly (choice by content `signature`, deliberately not `id`), checks the shared per-minute limit before spending a provider call, refunds provider failures, and has a pure adapter seam (`RawTransitOption` into `finalizeOptions`) that makes adding a second provider one adapter. B was smaller but had a wrong merge claim, hand-synced edge and client parsers, a lossy unknown-mode mapping to `bus`, and a wide sheet that owns all orchestration.

Deltas applied to A:

1. Grafted from B. Extract the start-time cascade into a pure `cascadeStartTimes(day, placesById, clusters, fromPlaceId)` in `schedule.ts`, used by `updateStopSchedule`. Choosing a route does not re-run it, because the cascade only fills stops with no time.
2. Grafted from B. The edge function fetches the provider token before reserving quota, so a missing secret cannot spend a user's cap.
3. Judge red flag. No provider wire format in the domain. `TransitBasis.departAt` is an ISO instant; conversion to Taipei-local `yyyy-mm-ddTHH:mm:ss` happens inside the TDX request builder. Drop the `TaipeiDateTime` brand.
4. Judge red flag. Attribution is `TRANSIT_ATTRIBUTION: Record<TransitProviderId, TranslationKey | null>`, and the ledger `model` is the provider id. `TransitProviderId` is one union shared by the domain, the edge response and the ledger.
5. Judge red flag. One way to estimate. `estimateTravelMinutes` stops being exported and is called only inside `resolveLeg`. `nextAnchor`'s fallback `leg.minutes ?? estimateTravelMinutes(...)` (schedule.ts:111) goes away; placeholders give 0.
6. Rejected from B. An ESLint import boundary: the repo has no ESLint, and adding tooling for one rule does not earn its place.
7. New fact after the arena. If Transitous is used (non-commercial, open-source licence required), it is a second adapter behind the same edge function, never a browser-direct call, so the ledger, the cap and assumption A still hold.

## Tradeoffs accepted

- We accept that concurrent refreshes of the same leg by two collaborators produce field-level conflicts on `options`, `basis` and `fetchedAt`, which could resolve to mixed picks. In exchange we need no merge-engine changes. Each pick is still internally valid, because `chosen` is validated at read and the worst case is a stale badge.
- We accept that a refresh which no longer returns the chosen lines clears the choice. The leg falls back to the estimate and shows "Your chosen route isn't offered any more". In exchange we never silently pin minutes to a route that doesn't exist.
- We accept storing un-chosen options in the trip, about 1–3 KB per looked-up leg, for ADR 3's offline and collaborator visibility. We accept that a lookup without a choice still causes a trip save.
- We accept time-of-day-only departure staleness. It ignores weekday-versus-holiday timetable differences in exchange for not marking every far-future lookup stale.
- We accept a global advisory lock on every transit reservation, which serializes them, in exchange for a real per-minute guard. At 5 calls per minute that serialization is free.
- We accept that transit rows live in a table named `ai_import_usage` (per ADR 8) in exchange for one ledger and one migration.
- We accept no server-side route cache. The trip's saved routes are the cache. Cross-user hits would be rare because keys include departure time, and a cache adds a table, a TTL and an invalidation story.
- We accept that choosing a route doesn't re-run the start-time cascade. That matches mode changes, and warnings show the gap.
- We accept that `resolveLeg` now does slightly more work per call: one record lookup plus three comparisons. It runs O(legs) per render, as before.

## Alternatives considered

- **Separate per-leg overlay passed into `resolveLeg`**, such as `resolveLeg(day, clusters, from, to, transitRoutes)`, with routes in a top-level `TripState.transitRoutes`. Lost on interface depth: every one of the ~8 callers would have to fetch and thread the extra argument, and a caller that forgets it compiles and silently uses the estimate. That is the exact bug we are fixing. Keeping routes on `day` makes forgetting impossible.
- **Store `chosen` as an index, or store a separate `chosenMinutes`.** An index breaks under the merge (A refreshes and B's index points at a different route). A copied minutes value is a second source that drifts on refresh. Content signatures avoid both.
- **Per-collaborator route records with merge at read** (`transitByLeg[key][userId]`). This follows the separate-before-serializing default literally, but the product has one plan per leg, not one per person. The read rule (whose choice wins?) would be the same last-writer-wins guess the merger already makes, plus a growing record.
- **Persisting staleness** (`stale: true` written by mutators, like `markRouteStale`). This is the pattern that rotted into a no-op across 15 call sites. Derived staleness needs no mutator cooperation.
- **Client calls TDX directly with a per-user key**, or **viewers call through an anonymous endpoint.** The first was ruled out because TDX expects server-side calls and secret keys can't ship. The second was ruled out because anonymous calls can't be capped per user (assumption A).
- **Server-side shared route cache table.** Rejected above: low hit rate and real complexity.

## Open questions and risks

- Should choosing a route re-run the start-time cascade for auto-filled downstream times? It doesn't in this sketch, and warnings flag the gap.
- How far ahead does TDX accept `depart`? The sketch assumes a TODO policy: if TDX rejects a far-future date, re-query the same weekday within the accepted window, and record the actual `departAt` in `basis`. Does that "representative day" behavior match what users expect?
- Does TDX return English line or stop names? Decision 13 stores names verbatim. If TDX offers both, should `TransitStep` keep `lineEn?` and `stopEn?`?
- Should the collapsed leg row (currently an 8 px spacer) show a minutes button for every eligible leg? That is visual noise on long days. The alternative is showing it only when a route is saved.
- Should `legModeOverrides` get the same orphan pruning in the same change, since the pruner is right there? Is that in or out of scope?
- `describeTripChanges` emits nothing for leg changes. Should choosing a route appear in the activity log?
- Risk: the adapter is written blind. Recording the fixture is step one, and the first real call may reshape `TransitStep`, especially fare and per-step minutes.
- Risk: 5 calls per minute shared by all users. Should `TDX_CLIENTS` hold up to 3 keys with round-robin from day one?
- Should `AuthContextValue` gain `kind: 'signedIn' | 'demo' | 'sharedViewer'`? This sketch adds it. The alternative is inferring from `user.id === 'demo'`.

## Next implementation step

Record a real TDX routing response as `supabase/functions/transit-routes/_shared/fixtures/tdx-taipei101-longshan.json`, then write `adaptTdxRouting` test-first against it. Every other type here depends on what `sections` actually contains.

---

## Module map

| Path | New or changed | Owns |
|---|---|---|
| `src/domain/transit.ts` | new | Domain types, `isTransitEligible`, `legTransit` (staleness and chosen derivation), `departureFor`, `TaipeiDateTime`, `finalizeOptions` (signature, sort, dedupe), `mergeLookup` (keep choice on refresh), `pruneTransitByLeg` |
| `src/domain/transit.test.ts` | new | Staleness thresholds, signature stability, choice survival, pruning identity |
| `src/types.ts` | changed | `TripDay.transitByLeg`. Deletes `RouteLeg`, `RouteStep`, `RouteStepKind` and the four `route*` fields |
| `src/utils/routing.ts` | changed | `resolveLeg` reads transit and gains `transit`, `minutesSource` and `key`. Deletes `markRouteStale`, `isRouteCurrent`, `effectiveLegMode` |
| `src/utils/schedule.ts` | changed | `plannedLeaveMinutes`. `dayWarnings` and `dayWarningCount` take `clusters` and use resolved legs. `nextAnchor` returns `leg` and `legRef` |
| `src/domain/tripRestoration.ts` | changed | Defaults `transitByLeg` to `{}`, strips dead fields, prunes |
| `src/hooks/useTripState.ts` | changed | `saveTransitLookup`, `chooseTransitRoute`, cascade through `resolveLeg`, `normalizeOnWrite` prunes, removes all `markRouteStale` calls |
| `src/utils/applyAiDraft.ts` | changed | Drops `markRouteStale` |
| `src/lib/transitClient.ts` | new (replaces `transitProvider.ts`) | `TransitClient`, `transitClientFor`, edge fetch, response parsing, error mapping, session cache |
| `src/lib/transitMock.ts` | new (moved from `transitProvider.ts`) | Mock generator emitting `RawTransitOption` |
| `src/lib/transitClient.test.ts` | new (replaces `transitProvider.test.ts`) | Cache, error mapping, contract test over the edge fixture, type-equality assertion |
| `src/hooks/useLegTransit.ts` | new | Per-leg controller for the sheet |
| `src/components/TransitSheet.tsx` | new (replaces `TransitOptionsModal.tsx`) | `TransitSheetProvider`, `useTransitSheet`, the modal, the `STEP_LABEL` table, attribution |
| `src/components/TransportLegChip.tsx` | changed | Takes `leg: ResolvedLeg` and `onOpenTransit`. Tappable minutes. Read-only chips can still open transit. Chosen and stale marks. Exports `LegMinutesButton` |
| `src/components/DayColumn.tsx`, `MapLegChips.tsx` | changed | Pass `onOpenTransit`. Collapsed-row button. PlaceCard minutes from `legs` |
| `src/components/TodayModePage.tsx` | changed | "Show transit" link, refresh suggestion after 7 days |
| `src/components/TaiwanMap.tsx` | changed | Removes the `routeStale` banner. Wraps nothing new (the provider sits at app root) |
| `src/context/AuthContext.tsx` | changed | `kind` field |
| `src/App.tsx` (or the planner root) | changed | Mounts `TransitSheetProvider` inside `TripContext` |
| `src/i18n.tsx` | changed | Transit keys. Removes dead route keys |
| `src/utils/transit.ts` | changed (signature only) | `summarizeTransitOption(option: TransitOption)`. Body stays TODO(human) |
| `supabase/migrations/202610190001_transit_usage.sql` | new | Constraint, index, AI pool fix, `reserve_transit_usage` |
| `supabase/schema.sql` | changed | Mirrors the migration |
| `supabase/config.toml` | changed | `[functions.transit-routes] verify_jwt = true` |
| `supabase/functions/transit-routes/index.ts` | new | Handler |
| `supabase/functions/transit-routes/_shared/tdx.ts` | new | Token source and routing call |
| `supabase/functions/transit-routes/_shared/tdxAdapter.ts` | new | Pure TDX to `TransitOptionV1` |
| `supabase/functions/transit-routes/_shared/tdxAdapter.test.ts` | new | `node --test` over fixtures, added to `test:security` (renamed `test:edge`) |
| `supabase/functions/transit-routes/_shared/fixtures/*.json` | new | Recorded TDX responses |

## Type and signature sketch

### `src/domain/transit.ts`

```ts
import type { Place, TravelMode, TripDay } from '../types';

export interface LatLng { lat: number; lng: number }

/** Taipei-local 'yyyy-mm-ddTHH:mm'. Only produced by toTaipeiDateTime/parseTaipeiDateTime. */
export type TaipeiDateTime = string & { readonly __brand: 'TaipeiDateTime' };

/** Exhaustive. Adding a kind fails the build in TransitSheet's STEP_LABEL table and the edge MODE table. */
export type TransitStepKind = 'walk' | 'bus' | 'metro' | 'tra' | 'thsr' | 'lightRail' | 'ferry' | 'cableCar' | 'other';

export interface TransitStep {
  kind: TransitStepKind;
  minutes: number;
  /** Provider-verbatim line name (decision 13). Absent for walk. */
  line?: string;
  fromStop?: string;
  toStop?: string;
  stopCount?: number;
  distanceMeters?: number;
}

export interface TransitOption {
  /**
   * Ride sequence, e.g. "metro:淡水信義線>bus:307", or "walk". Unique within a lookup.
   * Deliberately NOT named `id`: mergeTripState merges id-keyed arrays element-wise, and options must merge whole.
   */
  signature: string;
  minutes: number;
  steps: TransitStep[];
  fare?: { amount: number; currency: 'TWD' };
}

/** What a provider adapter or the mock emits before the domain finalizes it. */
export type RawTransitOption = Omit<TransitOption, 'signature'>;

export interface TransitBasis { from: LatLng; to: LatLng; departAt: TaipeiDateTime }

/** One lookup's result. Written whole by saveTransitLookup. */
export interface TransitLookup {
  provider: 'tdx' | 'mock';
  fetchedAt: string;
  basis: TransitBasis;
  options: TransitOption[];
}

/** Persisted at day.transitByLeg[routeLegKey(from, to)]. */
export interface SavedLegTransit extends TransitLookup {
  /** A signature from `options`. Validated on read, never trusted. */
  chosen?: string;
}

/** How a UI entry point names a leg. Keys never leave the domain. */
export interface LegRef { dayId: string; fromPlaceId: string; toPlaceId: string }

export type StaleReason = 'fromMoved' | 'toMoved' | 'departureShifted';

export type LegTransit =
  | { status: 'ineligible' }
  | { status: 'empty' }
  | { status: 'saved'; saved: SavedLegTransit; chosen: TransitOption | null; stale: readonly StaleReason[] };

export const DEPARTURE_STALE_MINUTES = 30;
export const MOVED_STALE_METERS = 25;
export const TODAY_REFRESH_SUGGEST_DAYS = 7;
export const TDX_ATTRIBUTION = '交通部運輸資料流通服務平臺';

/** Decision 9 plus decision 7. The single eligibility rule for every entry point. */
export function isTransitEligible(mode: TravelMode, inside: boolean, from: Place, to: Place): boolean {
  // TODO: mode === 'public' && !inside && !isPlaceholder(from) && !isPlaceholder(to) && inTaiwan(from) && inTaiwan(to)
  throw new Error('not implemented');
}

/**
 * Derive the leg's transit view. Called only by resolveLeg.
 * @param leaveMinutes the from-stop's planned leave time (start + duration) when Times are on, else null.
 */
export function legTransit(
  saved: SavedLegTransit | undefined, eligible: boolean, from: Place, to: Place, leaveMinutes: number | null,
): LegTransit {
  // TODO:
  // if (!eligible) return { status: 'ineligible' }
  // if (!saved) return { status: 'empty' }
  // chosen = saved.options.find(o => o.signature === saved.chosen) ?? null   // invalid/merged-away choice → null
  // stale = []
  //   haversineMeters(saved.basis.from, from) > MOVED_STALE_METERS → 'fromMoved'; same for 'toMoved'
  //   leaveMinutes !== null && circularDiff(leaveMinutes, minutesOfDay(saved.basis.departAt)) > DEPARTURE_STALE_MINUTES → 'departureShifted'
  throw new Error('not implemented');
}

export interface DepartureInput {
  surface: 'planner' | 'today';
  timesOn: boolean;
  /** tripDayDate(startDate, dayIndex), 'yyyy-mm-dd'. */
  dayDate: string;
  leaveMinutes: number | null;
}

/** ADR 4. Never returns a past time. "Now" is rounded up to the next 5 minutes so the request can't land in the past. */
export function departureFor(input: DepartureInput, now: Date): TaipeiDateTime {
  // TODO:
  // nowT = ceilTo5(toTaipeiDateTime(now))
  // if (surface === 'today' || !timesOn || leaveMinutes === null) return nowT
  // planned = `${dayDate}T${toTime(leaveMinutes)}`
  // return planned < nowT ? nowT : planned      // lexical compare is valid for this fixed format
  throw new Error('not implemented');
}

export function toTaipeiDateTime(instant: Date): TaipeiDateTime { throw new Error('not implemented'); }
export function parseTaipeiDateTime(value: unknown): TaipeiDateTime | null { throw new Error('not implemented'); }

/** Adds signatures, dedupes by signature keeping the fastest, sorts fastest first. Shared by TDX and mock paths. */
export function finalizeOptions(raw: RawTransitOption[]): TransitOption[] {
  // TODO: signature = rides.map(s => `${s.kind}:${s.line ?? '?'}`).join('>') || 'walk'
  throw new Error('not implemented');
}

/**
 * New lookup over an old record. Keeps `chosen` iff the same signature is still offered.
 * Idempotent: applying the same lookup twice yields the same record.
 */
export function mergeLookup(previous: SavedLegTransit | undefined, lookup: TransitLookup): SavedLegTransit {
  throw new Error('not implemented');
}

/** Drops keys whose from or to id is no longer on the day. Returns `day` itself when nothing changes. */
export function pruneTransitByLeg(day: TripDay): TripDay {
  throw new Error('not implemented');
}
```

### `src/types.ts` (delta)

```ts
export interface TripDay {
  id: string; label: string; placeIds: string[]; travelMode?: TravelMode; startTime?: string;
  stopSchedules?: Record<string, StopSchedule>; lodgingPlaceId?: string; timeManagementEnabled?: boolean;
  legModeOverrides?: Record<string, RouteLegMode>;
  /** Saved transit lookups keyed by routeLegKey(from, to). Defaults to {} in normalizeTripState so collaborators merge per key. */
  transitByLeg?: Record<string, SavedLegTransit>;
  // removed: routeLegs, routeUpdatedAt, routeStale, routeError
}
// removed: RouteLeg, RouteStep, RouteStepKind
```

### `src/utils/routing.ts` (delta)

```ts
export interface ResolvedLeg {
  from: Place; to: Place;
  key: string;
  legMode: RouteLegMode;
  mode: TravelMode;
  /** THE leg minutes. Chosen transit > cluster member > straight-line estimate > undefined (placeholder). */
  minutes?: number;
  minutesSource: 'transit' | 'cluster' | 'estimate' | 'none';
  relationship?: LegRelationship;
  inside: boolean;
  transit: LegTransit;
}

export function resolveLeg(day: TripDay, clusters: LocationCluster[], from: Place, to: Place): ResolvedLeg {
  // TODO: existing mode resolution unchanged, then:
  // key = routeLegKey(from.id, to.id)
  // transit = legTransit(day.transitByLeg?.[key], isTransitEligible(mode, inside, from, to), from, to,
  //                      day.timeManagementEnabled ? plannedLeaveMinutes(day, from) : null)
  // minutes = transit.status === 'saved' && transit.chosen ? transit.chosen.minutes : <existing cluster/estimate rule>
  throw new Error('not implemented');
}
// deleted: markRouteStale, isRouteCurrent, effectiveLegMode
```

### `src/utils/schedule.ts` (delta)

```ts
/** From-stop's planned leave time in minutes of day, or null when it has no start time. */
export function plannedLeaveMinutes(day: TripDay, from: Place): number | null { throw new Error('not implemented'); }

export function dayWarnings(day: TripDay, places: Place[], clusters: LocationCluster[]): Map<string, string[]> {
  // TODO: legs = places.slice(1).map((p, i) => resolveLeg(day, clusters, places[i], p))
  // for each timed stop i after a previous timed stop j: travel = sum(legs[j..i-1].minutes ?? 0)
  // 'Insufficient travel time' when startsAt < previous.endsAt + travel
  throw new Error('not implemented');
}
export function dayWarningCount(day: TripDay, places: Place[], clusters: LocationCluster[]): number { throw new Error('not implemented'); }

export type NextAnchor =
  | { kind: 'leaveBy'; leaveAt: string; arriveBy: string; travelMinutes: number; mode: TravelMode; toPlaceId: string;
      /** Null when there is no current stop (first stop of the day). */
      leg: ResolvedLeg | null; legRef: LegRef | null }
  | { kind: 'opensAt'; opensAt: string; placeId: string }
  | { kind: 'none' };
```

### `src/hooks/useTripState.ts` (new mutators)

```ts
/**
 * Applies a finished lookup. Functional update re-checks: day exists, both ids on the day, and
 * current coordinates match lookup.basis (else drop. The result is stale on arrival). Uses mergeLookup.
 */
const saveTransitLookup = useCallback((ref: LegRef, lookup: TransitLookup) => {
  if (readOnly) return;
  throw new Error('not implemented');
}, [readOnly]);

/** Sets or clears the chosen route. No-op unless `signature` is null or present in the saved options. */
const chooseTransitRoute = useCallback((ref: LegRef, signature: string | null) => {
  if (readOnly) return;
  throw new Error('not implemented');
}, [readOnly]);

// withNormalizedWindows → normalizeOnWrite: normalizeFlexibleWindows + days.map(pruneTransitByLeg)
// updateStopSchedule cascade: nextStart += resolveLeg(day, current.locationClusters ?? [], previousPlace, nextPlace).minutes ?? 0
```

### `src/lib/transitClient.ts`

```ts
import type { LatLng, TaipeiDateTime, TransitLookup } from '../domain/transit';

export interface TransitRequest { from: LatLng; to: LatLng; departAt: TaipeiDateTime }

export type TransitLookupError =
  | { kind: 'limitReached'; resetsAt?: string }   // 429 TRANSIT_LIMIT_REACHED
  | { kind: 'busy' }                              // 503 TRANSIT_BUSY ("Busy, try again in a minute")
  | { kind: 'offline' }                           // navigator.onLine false or fetch TypeError
  | { kind: 'unavailable'; requestId?: string };  // anything else, including an unparseable body

export type TransitLookupResult = { ok: true; lookup: TransitLookup } | { ok: false; error: TransitLookupError };

export interface TransitClient {
  readonly provider: 'tdx' | 'mock';
  /** Never rejects for expected failures. Successful results are memoized for the session by basis. */
  lookup(request: TransitRequest, signal?: AbortSignal): Promise<TransitLookupResult>;
}

/** Signed in → TDX via edge function; demo → mock; share viewer → null (read saved routes only). */
export function transitClientFor(auth: { kind: 'signedIn' | 'demo' | 'sharedViewer'; accessToken: string }): TransitClient | null {
  throw new Error('not implemented');
}

/** Boundary validation of the edge response into domain options (runs finalizeOptions). Null on any shape violation. */
export function parseTransitRoutesResponse(body: unknown): { departAt: TaipeiDateTime; fetchedAt: string; options: TransitOption[] } | null {
  throw new Error('not implemented');
}

// TODO internals (not exported):
// const sessionCache = new Map<string, Promise<TransitLookupResult>>()
// key = `${provider}|${round5(from)}|${round5(to)}|${departAt}`; on non-ok result → sessionCache.delete(key)
// edge error mapping: 429 + code TRANSIT_LIMIT_REACHED → limitReached{resetsAt}; 503 + TRANSIT_BUSY → busy; else unavailable{requestId}
// basis.departAt comes from the RESPONSE (server may clamp), not the request
```

### `src/hooks/useLegTransit.ts`

```ts
export type TransitSurface = 'planner' | 'today';

export interface LegTransitController {
  /** Null when the leg no longer exists in live state (stops moved while the sheet was open). */
  resolved: ResolvedLeg | null;
  view: LegTransit;
  request: { status: 'idle' } | { status: 'loading' } | { status: 'failed'; error: TransitLookupError };
  /** Undefined for share viewers and offline read-only trips. */
  refresh: (() => void) | undefined;
  /** Undefined for read-only. Arms an undo point. */
  choose: ((signature: string | null) => void) | undefined;
  /** Stale, or (today surface and fetchedAt older than TODAY_REFRESH_SUGGEST_DAYS). */
  suggestRefresh: boolean;
  /** Google Maps fallback (no network and nothing saved, or always as a secondary link). */
  openRouteUrl: string;
}

export function useLegTransit(ref: LegRef, surface: TransitSurface): LegTransitController {
  // TODO:
  // const { state, readOnly, saveTransitLookup, chooseTransitRoute, markUndoPoint } = useTripContext()
  // const client = useMemo(() => readOnly ? null : transitClientFor(auth), [readOnly, auth.kind, auth.accessToken])
  // resolved = resolve from state by ref (day, adjacency, places) → resolveLeg
  // refresh = client && resolved eligible ? () => {
  //   departAt = departureFor({ surface, timesOn, dayDate: tripDayDate(state.startDate, dayIndex), leaveMinutes: plannedLeaveMinutes(day, from) }, new Date())
  //   setRequest(loading); result = await client.lookup({ from, to, departAt }, abort.signal)
  //   ok → markUndoPoint(t('transitUpdated')); saveTransitLookup(ref, result.lookup); setRequest(idle)
  //   else setRequest(failed(result.error))
  // } : undefined
  // effect: once per (ref, open) — if view.status === 'empty' && refresh → refresh()   // never when 'saved' (ADR 11)
  throw new Error('not implemented');
}
```

### `src/components/TransitSheet.tsx`

```ts
export interface OpenTransitOptions { surface?: TransitSurface }
export function TransitSheetProvider(props: { children: React.ReactNode }): JSX.Element { throw new Error('not implemented'); }
/** The only way UI opens transit. */
export function useTransitSheet(): { openTransit: (ref: LegRef, options?: OpenTransitOptions) => void } { throw new Error('not implemented'); }

/** Exhaustive: a new TransitStepKind fails the build here. */
const STEP_LABEL: Record<TransitStepKind, TranslationKey> = {
  walk: 'walk', bus: 'transitBus', metro: 'transitMetro', tra: 'transitTra', thsr: 'transitThsr',
  lightRail: 'transitLightRail', ferry: 'transitFerry', cableCar: 'transitCableCar', other: 'transitOther',
};
// Footer: provider === 'tdx' ? `${t('transitDataSource')} ${TDX_ATTRIBUTION}` : t('transitSampleData'); plus Open route.
```

### `src/components/TransportLegChip.tsx` (props delta)

```ts
interface TransportLegChipProps {
  leg: ResolvedLeg;                  // replaces mode/minutes/isOverride/context/transitStops
  dayDefaultMode: TravelMode;
  readOnly?: boolean;
  hideDefaultItem?: boolean;
  onChange: (mode: TravelMode | 'default') => void;
  /** Present iff leg.transit is not 'ineligible'. Adds the menu item and makes the minutes a button, also when readOnly. */
  onOpenTransit?: () => void;
}
/** Collapsed-row affordance: "· 23 min", with a chosen-route mark and a stale dot. */
export function LegMinutesButton(props: { leg: ResolvedLeg; onClick: () => void }): JSX.Element { throw new Error('not implemented'); }
```

## SQL migration sketch: `supabase/migrations/202610190001_transit_usage.sql`

```sql
alter table public.ai_import_usage drop constraint if exists ai_import_usage_source_type_check;
alter table public.ai_import_usage add constraint ai_import_usage_source_type_check
  check (source_type in ('text', 'url', 'transit'));

create index if not exists ai_import_usage_user_source_created_idx
  on public.ai_import_usage (user_id, source_type, created_at desc);
create index if not exists ai_import_usage_transit_recent_idx
  on public.ai_import_usage (created_at desc) where source_type = 'transit';

-- AI pool must stop counting transit rows (otherwise 30 transit lookups exhaust AI import).
create or replace function public.reserve_ai_import_usage(
  p_user_id uuid, p_trip_plan_id uuid, p_source_type text, p_model text, p_input_characters integer, p_daily_limit integer)
returns uuid language plpgsql security invoker set search_path = '' as $$
  -- body identical to 20260728023448 except the count adds:
  --   and source_type in ('text', 'url')
  -- and a guard: if p_source_type not in ('text','url') then raise exception 'Not an AI source';
$$;

create or replace function public.reserve_transit_usage(
  p_user_id uuid,
  p_daily_limit integer,       -- 30
  p_per_minute_limit integer   -- 5 × configured TDX keys
)
returns table (outcome text, reservation_id uuid, resets_at timestamptz)
language plpgsql security invoker set search_path = ''
as $$
declare
  minute_count integer;
  day_count integer;
  oldest timestamptz;
  new_id uuid;
begin
  if p_daily_limit < 1 or p_daily_limit > 1000 or p_per_minute_limit < 1 or p_per_minute_limit > 100 then
    raise exception 'Invalid transit limits';
  end if;

  -- One global lock: the per-minute budget is shared by all users (TDX key limit).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('transit-routes', 0));

  select count(*)::integer into minute_count from public.ai_import_usage
   where source_type = 'transit' and status in ('started', 'completed')
     and created_at >= pg_catalog.now() - interval '1 minute';
  if minute_count >= p_per_minute_limit then
    return query select 'busy'::text, null::uuid, null::timestamptz; return;
  end if;

  select count(*)::integer, min(created_at) into day_count, oldest from public.ai_import_usage
   where user_id = p_user_id and source_type = 'transit' and status in ('started', 'completed')
     and created_at >= pg_catalog.now() - interval '24 hours';
  if day_count >= p_daily_limit then
    return query select 'limit'::text, null::uuid, oldest + interval '24 hours'; return;
  end if;

  insert into public.ai_import_usage (user_id, trip_plan_id, source_type, model, status, input_characters)
  values (p_user_id, null, 'transit', 'tdx-maas-routing', 'started', 0)
  returning id into new_id;
  return query select 'reserved'::text, new_id, null::timestamptz;
end;
$$;

revoke execute on function public.reserve_transit_usage(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_transit_usage(uuid, integer, integer) to service_role;
-- Mirror all of the above in supabase/schema.sql.
```

Status semantics for transit rows: `completed` (TDX answered, adapter parsed, including zero options) counts. `failed`, with `error_code` in `TDX_RATE_LIMITED`, `TDX_UNAVAILABLE`, `PROVIDER_RESPONSE_INVALID` or `INTERNAL_ERROR`, is refunded by exclusion from the count. A crashed `started` row still counts. That is conservative and acceptable.

## Edge function sketch: `supabase/functions/transit-routes/`

```ts
// index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createTdxTokenSource, fetchTdxRouting } from './_shared/tdx.ts';
import { adaptTdxRouting, AdapterShapeError, type TransitOptionV1 } from './_shared/tdxAdapter.ts';

interface TransitRoutesRequest { from: { lat: number; lng: number }; to: { lat: number; lng: number }; departAt: string }
interface TransitRoutesResponse { version: 1; departAt: string; fetchedAt: string; options: TransitOptionV1[] }
type ErrorCode = 'AUTH_REQUIRED' | 'METHOD_NOT_ALLOWED' | 'INVALID_REQUEST' | 'OUTSIDE_TAIWAN'
  | 'TRANSIT_LIMIT_REACHED' | 'TRANSIT_BUSY' | 'PROVIDER_RESPONSE_INVALID' | 'PROVIDER_UNAVAILABLE' | 'INTERNAL_ERROR';
// fail(code, message, status, requestId, request, extra?) → { code, message, requestId, retryable, resetsAt? }  (same shape as ai-itinerary-import)

const DAILY_LIMIT = positiveIntegerEnv('TRANSIT_DAILY_LIMIT', 30, 1000);
const PER_MINUTE_LIMIT = positiveIntegerEnv('TRANSIT_PER_MINUTE_LIMIT', 5, 100);
const tokens = createTdxTokenSource(Deno.env.get('TDX_CLIENT_ID'), Deno.env.get('TDX_CLIENT_SECRET'));

Deno.serve(handle);

export async function handle(request: Request): Promise<Response> {
  // TODO:
  // OPTIONS → CORS; non-POST → 405
  // Bearer + userClient.auth.getUser() → 401 AUTH_REQUIRED
  // body = parseRequest(await request.json())          → 400 INVALID_REQUEST | OUTSIDE_TAIWAN
  //   departAt = max(parsed, ceilTo5(nowTaipei()))        // server-authoritative clamp
  // r = service.rpc('reserve_transit_usage', { p_user_id, p_daily_limit, p_per_minute_limit })
  //   'busy'  → 503 TRANSIT_BUSY (retryable, Retry-After: 60)
  //   'limit' → 429 TRANSIT_LIMIT_REACHED { resetsAt }
  // res = await fetchTdxRouting(tokens, { ...body, departAt })
  //   rateLimited → mark failed TDX_RATE_LIMITED → 503 TRANSIT_BUSY
  //   unavailable/rejected → mark failed → 502 PROVIDER_UNAVAILABLE
  //   TODO(fixture): if TDX rejects far-future depart, retry once with sameWeekdayWithinWindow(departAt); use that departAt in the response
  // try { options = adaptTdxRouting(res.body).options } catch (AdapterShapeError e) { log(requestId, e.sample); mark failed; 502 }
  // mark completed; return { version: 1, departAt, fetchedAt: new Date().toISOString(), options }
  throw new Error('not implemented');
}

function parseRequest(value: unknown): TransitRoutesRequest | { error: 'INVALID_REQUEST' | 'OUTSIDE_TAIWAN' } {
  throw new Error('not implemented');
}
```

```ts
// _shared/tdx.ts. No Deno globals, so node --test and vitest can import it.
export interface TdxTokenSource { get(): Promise<string>; invalidate(): void }

/** Module-scope cache per isolate; in-flight dedupe; refresh 5 min before expires_in. */
export function createTdxTokenSource(clientId: string | undefined, clientSecret: string | undefined, fetchImpl: typeof fetch = fetch): TdxTokenSource {
  // TODO: POST https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token
  //       grant_type=client_credentials; throws ConfigError when ids missing
  throw new Error('not implemented');
}

export type TdxRoutingResult =
  | { ok: true; body: unknown }
  | { ok: false; reason: 'rateLimited' | 'departRejected' | 'unavailable'; status: number };

/** GET /api/maas/routing?origin=lat,lng&destination=lat,lng&gc=1&top=5&transit=<all codes>&depart=... ; on 401 invalidate + retry once. */
export async function fetchTdxRouting(tokens: TdxTokenSource, query: { from: { lat: number; lng: number }; to: { lat: number; lng: number }; departAt: string }, fetchImpl: typeof fetch = fetch): Promise<TdxRoutingResult> {
  throw new Error('not implemented');
}
```

```ts
// _shared/tdxAdapter.ts. Pure. Shape is a GUESS until the fixture is recorded; every guess is marked.
export type TransitStepKindV1 = 'walk' | 'bus' | 'metro' | 'tra' | 'thsr' | 'lightRail' | 'ferry' | 'cableCar' | 'other';
export interface TransitStepV1 { kind: TransitStepKindV1; minutes: number; line?: string; fromStop?: string; toStop?: string; stopCount?: number; distanceMeters?: number }
/** Must equal Omit<TransitOption, 'signature'>. src/lib/transitClient.test.ts asserts it at typecheck time. */
export interface TransitOptionV1 { minutes: number; steps: TransitStepV1[]; fare?: { amount: number; currency: 'TWD' } }

export class AdapterShapeError extends Error { constructor(message: string, readonly sample: string) { super(message); } }

/** One table: TDX mode code → domain kind. Unknown codes → 'other' (never throw on a new mode). */
const MODE: Record<string, TransitStepKindV1> = { /* TODO(fixture): fill from recorded codes */ };

export function adaptTdxRouting(raw: unknown): { options: TransitOptionV1[]; dropped: number } {
  // TODO (GUESS: raw.data.routes[].sections[] with type 'pedestrian' | 'transit', travelSummary.duration in seconds,
  //       transport.mode / transport.name, departure.place.name, arrival.place.name, intermediateStops?.length, fare?):
  // routes = readArray(raw, ['data', 'routes']) ?? readArray(raw, ['routes'])
  // for each route: steps = sections.map(sectionToStep); if any step null → dropped++, continue
  //   minutes = round(sum(step seconds) / 60) || round(route-level duration / 60)
  // if routes.length > 0 && options.length === 0 → throw new AdapterShapeError('no parsable routes', JSON.stringify(raw).slice(0, 2000))
  throw new Error('not implemented');
}
```

```ts
// src/lib/transitClient.test.ts. The contract guard between edge and client.
import { expectTypeOf } from 'vitest';
import { adaptTdxRouting, type TransitOptionV1 } from '../../supabase/functions/transit-routes/_shared/tdxAdapter.ts';
import fixture from '../../supabase/functions/transit-routes/_shared/fixtures/tdx-taipei101-longshan.json';
expectTypeOf<TransitOptionV1>().toEqualTypeOf<Omit<TransitOption, 'signature'>>();
// it('client parses what the edge adapter emits for the recorded fixture', ...)
```
