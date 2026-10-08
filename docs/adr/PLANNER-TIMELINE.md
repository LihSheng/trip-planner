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
