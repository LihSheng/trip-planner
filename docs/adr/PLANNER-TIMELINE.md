# Planner timeline day view

Date: 2026-10-08. Source: `docs/UX_RESEARCH_2026-10.md`, Tier 2 "Timeline day view".

## Problem

An expanded planner day lists stop names only. Start times appear only after enabling Times and adding a time per stop, and nothing sits between stops even though the header already knows each leg's mode and minutes. Travellers cannot see the shape of the day.

The day also has two travel-time sources that disagree. Stop cards, `dayWarnings` and the `updateStopSchedule` cascade use a straight-line estimate with the day's default mode. The leg chips, the map and Today's leave-by line use `resolveLeg`, which honours per-leg overrides and location-cluster connections. A timeline built on either source alone would contradict the other on screen.

## Data shape

One pure projection is the only source of timing for a day.

```ts
type StopTiming = { start: number; end: number; source: 'planned' | 'estimated' };
type ScheduleWarning = { kind: 'outsideHours' } | { kind: 'shortTravel'; shortByMinutes: number };
type DayProjection = {
  stops: { place: Place; timing: StopTiming; warnings: ScheduleWarning[] }[];
  legs: ResolvedLeg[]; // legs[i] sits between stops[i] and stops[i + 1]
};
function projectDay(day: TripDay, places: Place[], clusters: LocationCluster[]): DayProjection;
```

- A stored `stopSchedules[id].startTime` is an anchor (`planned`). Every other stop starts at the previous stop's end plus the leg minutes (`estimated`). The first stop defaults to `day.startTime ?? '09:00'`.
- Leg minutes come from `resolveLeg`; when it has none (placeholders), the leg contributes 0 and renders mode only.
- Warnings come from the same projection. `shortTravel` can only occur on a planned anchor that starts before the previous end plus travel.

Callers migrate in the same change: `dayWarnings` and `dayWarningCount` are replaced, and `updateStopSchedule` writes the projection's estimated starts for the stops it cascades into, so stored times agree with displayed times.

## Layout

Compared three throwaway variants at 720px and 375px.

| Layout | Verdict |
|---|---|
| A. Left time gutter with a rail, leg rows between stops | Chosen. Times scan in one column, the row moves as one unit when dragged. |
| B. Time pill inside each card, leg chip between | Graft the centered leg chip styling into A's leg row. |
| C. Proportional axis, height by duration | Rejected. Short legs collapse under cards, and absolute positioning fights drag sorting. |

Estimated times render muted with a `~` prefix and a dashed rail dot. Planned times render bold with a solid dot. The gutter shows start and end.

## Product defaults decided

- The timeline renders whether or not Times is on. Times now gates only the editing controls (day start, mode, lodging, per-stop inputs). Reason: the estimate is useful without opting in, and it is visibly marked as an estimate.
- Leg rows hide while a drag is active and reappear from the new order on drop, because dnd-kit only transforms the sortable rows.

## Out of scope

Today mode and the map strip keep reading stored times. Moving them onto `projectDay` would let Today's leave-by line work on days without planned times; that is the follow-up.

## Revised 2026-10-19

Rebuilt on main after PR #27 went stale. Main had since made `resolveLeg` the only source of leg minutes, including a chosen saved transit route (`docs/adr/TRANSIT-OPTIONS.md`), so the two-source problem above was already solved. Deltas from the 2026-10-08 design:

1. **Leg minutes come from `dayLegs`.** `projectDay` reads the same leg list as the planner header, `dayTravelMinutes` (map day totals) and the map strip. A chosen transit route's minutes move every later estimated time. There is no second estimator.
2. **Placeholders are bridged in `dayLegs`, not in `projectDay`.** Decided by the user: when placeholders sit between real stops, the leg after the last placeholder is `resolveLeg(lastReal, next)` and carries `follows` (the placeholder it sits after); the leg into a placeholder has no minutes. Its `from`/`to` are the real pair, so the mode menu writes that pair's override and the transit sheet opens for it. `legAt` accepts a pair with only placeholders between, so lookups and choices land on the same leg.
3. **Map drawing rule kept, applied to real ends.** A leg touching a placeholder still gets no line or chip. The bridged leg runs between two real stops, so the map draws it; otherwise the day total would count minutes no map label shows.
4. **`projectDay` replaces `dayWarnings`, `dayWarningCount` and `cascadeStartTimes`.** `updateStopSchedule` stores the projection's estimated starts (`storeProjectedStarts`). A planned stop after an untimed one is now checked against the untimed stop's projected end, duration included.
5. **The leg row hosts transit.** Tappable minutes for viewers and editors, the mode menu for editors, the chosen mark and the stale dot, all through `TransportLegChip`. The leg into a placeholder is a bare rail.
6. **"Show all legs" is gone.** Every leg has a row, and its minutes explain the gap between two gutter times; hiding default legs would hide why a time moved. The header warning count is gone too, as warnings sit on their stop.

Still out of scope: Today and the map read stored times.
