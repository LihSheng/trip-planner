# Sprint 1 UX: throughput checkpoint and design sketch

Date: 2026-10-08. Source of scope: `docs/UX_RESEARCH_2026-10.md` section 5.

## Playbook todo (Feature)

1. [x] `how` over the affected subsystems (explainer agent, read-only).
2. [x] `architect` design sketch. Arena limited to the one item with competing shapes (undo). The other three have one obvious shape; see below.
3. [x] Throughput checkpoint (this file).
4. [x] Delegate code-writing, one subagent per item, each in its own worktree and branch.
5. [x] Verify on the matching surface (browser at 375px and 1440px, vitest, typecheck).
6. [x] Rebase into small ordered commits. Stacked nav -> today -> pwa -> undo because all four add lines to `src/i18n.tsx`.
7. [x] `interrogate` skipped: no design was contested; delegates converged on the sketch.
8. [x] PRs 19 (docs), 20 (nav), 21 (today), 22 (pwa), 23 (undo) on LihSheng/trip-planner.

## Throughput checkpoint

- **Blocking first steps.** The `how` grounding and this sketch. Both done before fan-out. One more gate: confirm from the explainer that restoring a prior `TripState` snapshot flows through the normal save path and that the remote-merge layer does not re-apply the undone change.
- **Independent workstreams.** Four, by file ownership.
  - undo: `src/hooks/useTripState.ts`, `src/hooks/useTripPlanner.ts`, new `src/lib/undoNotification.tsx`, the call sites that show "moved/skipped/deleted" toasts.
  - today-header: `src/components/TodayModePage.tsx`, new pure helper in `src/utils/schedule.ts`, tests.
  - nav-parity: `src/App.tsx` (tab data only), `src/styles.css`, `src/i18n.tsx`.
  - pwa: `index.html`, `vite.config.ts`, new `public/manifest.webmanifest`, new `public/sw.js` or a plugin, `src/main.tsx` registration, header online/offline badge in `src/components/AppHeader.tsx`.
- **Shared mutable state.** `src/App.tsx` is touched by undo (toast call sites) and nav-parity (tab data). `src/i18n.tsx` by today-header and nav-parity. Split rather than serialize: each item gets its own branch off main and its own worktree. Expected conflicts are a few lines in two files and are resolved at rebase time by the parent.
- **Smallest safe decomposition.** Four workers. Each item is independently shippable and reviewable, and the research doc already ranks them as independent. One worker would serialize four unrelated verifications.

## Design sketch

### Undo (the only item with competing shapes)

| Candidate | Shape | Verdict |
|---|---|---|
| A. Single snapshot | `useTripState` keeps `lastUndoable: { label, before: TripState } \| null`. A wrapper `commitUndoable(label, updater)` records `current` before applying. `undo()` sets state to `before` and clears. The toast gets an Undo button that calls `undo()`. | **Base.** `TripState` is already replaced wholesale on every `setState(current => ...)`, so the snapshot is one reference, no clone. Smallest diff. |
| B. Inverse actions | Every mutation returns an inverse mutation. A stack of inverses. | Rejected. Touches all ~30 mutations, duplicates domain logic in reverse, and the cluster/placeholder mutations have no clean inverse. |
| C. Full history stack | Same as A but an array, with keyboard Ctrl+Z. | Rejected for this sprint. The traveller-facing need is "I mis-dragged or mis-tapped, take it back". One level, surfaced in the toast for its lifetime, covers it. The array is a one-line change later. |

Data shape (chosen before logic, per model-the-domain):

```ts
type Undoable = { label: string; before: TripState };
// state machine: idle -> armed(label, before) -> idle (on undo, on next undoable commit, or on remote merge)
```

Invariants:
- A remote merge (`mergeTripState`) disarms undo. Undoing across a collaborator's change would silently revert their work.
- `undo()` is idempotent: second call is a no-op because the slot is cleared.
- The restored state passes through the same persistence effect as any other change, so the cloud copy follows.

Toast helper: `showUndoableNotification({ title, message, onUndo })`. Mantine notifications accept a React node as `message`, so the Undo button lives inside the message. Call sites that gain Undo: drag between days and reorder (PlannerBoard), skip and complete in Today, delete place, remove day, move overdue tasks forward.

### Today header

Pure function in `src/utils/schedule.ts`:

```ts
type NextAnchor =
  | { kind: 'leaveBy'; leaveAt: string; arriveBy: string; travelMinutes: number; mode: TravelMode; toPlaceId: string }
  | { kind: 'opensAt'; opensAt: string; placeId: string }
  | { kind: 'none' };
function nextAnchor(day: TripDay, orderedPlaces: Place[], currentPlaceId: string | null, now: Date): NextAnchor
```

Rules: the next stop's planned `startTime` wins, else its `openingHours.closesAt` minus its duration is the latest arrival, else `none`. `leaveAt = arriveBy - estimateTravelMinutes(current, next, legMode)`. The Today hero card replaces "No fixed time" with the sentence built from the result. When `now > leaveAt` the sentence switches to "Leave now".

### Nav parity

One `WORKSPACE_VIEWS` table in `src/App.tsx` drives both the desktop SegmentedControl and the mobile bottom nav. Five entries: Today, Map, Places, Planner, Expenses. On desktop, Places opens the map workspace with the side panel on the Places tab. Mobile labels: the CSS already styles `.mantine-Button-label`, so the fix is whatever rule currently collapses it at 375px, plus a 10px font floor. Labels go through `t()`.

### PWA

`public/manifest.webmanifest` with the existing teal theme colour and an SVG icon. A hand-written `public/sw.js` (no new dependency, per the Laziness Protocol) that precaches the built shell on install, serves navigation requests cache-first with network fallback, and caches the last trip JSON response from Supabase under a stable key. `src/main.tsx` registers it in production only. The header shows an offline badge driven by `navigator.onLine` plus the online/offline events. Base path is `./`, so the service worker scope must be registered relative, not at `/`.

## Outcome

One semantic conflict surfaced only at the stack top: the Today and undo branches both added the i18n hook to `TodayModePage.tsx`. Fixed inside the undo commit. Desktop default view was pinned to Map at desktop width after the nav delegate chose Today for both.

## Delegate model note

The poteto-mode defaults name Cursor model slugs that this harness does not expose. Mapping used: code delegates on `sonnet`, the undo delegate and the `how` explainer on `opus` because undo crosses the state and sync boundary.
