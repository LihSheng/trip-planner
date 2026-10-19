# Transit options per leg: decisions, checkpoint and design sketch

Date: 2026-10-19. Prototype branch: `proto/transit-legs` (mock provider, tap-to-fetch modal).

## Playbook todo (Feature)

1. [x] `how` over the affected subsystems. Three read-only explorers; the parent reconciled their reports instead of a separate explainer pass.
2. [x] `architect` design sketch. Arena of two runners plus a cross-judge; result in `TRANSIT-OPTIONS-SKETCH.md`.
3. [x] Throughput checkpoint (this file).
4. [ ] Delegate code-writing.
5. [ ] Verify on the matching surface (browser at 375px and 1440px, vitest, typecheck).
6. [ ] Rebase into small ordered commits.
7. [ ] `interrogate` if the design is contested.
8. [ ] Open PRs.

## Product decisions (grilling rounds 1 and 2, all accepted)

1. Entry points in v1. The leg chip menu, tapping the minutes on any public-transport leg (collapsed legs included), and a "Show transit" link on Today mode's leave-by line. No route line on the map in v1.
2. Read-only viewers can open transit options.
3. Fetched options are saved with the trip, re-fetched only when stale. Collaborators see them and they work offline.
4. Departure time. The stop's planned time when the day has Times on, otherwise now. Today mode always uses now.
5. Picking an option sets the leg's minutes and marks it as the chosen route. No fare into Expenses in v1.
6. Budget. Free provider first, with a hard daily cap per user.
7. Taiwan only in v1. The provider sits behind one interface.
8. Cap. 30 new lookups per user per day in the existing usage ledger as `source_type = 'transit'`, separate from the AI quota. Saved or cached views are free. When the shared per-minute limit is hit, show "Busy, try again in a minute".
9. Eligible legs. Only legs whose resolved mode is public transport and that are not inside a venue. Walkable legs keep the walk chip.
10. Viewer lookups stay in the session and count against the viewer's own cap. Viewers see routes an editor saved.
11. Staleness. Stale when either stop moves or the departure time shifts by more than 30 minutes. Never auto-refetch. Show the saved date with a Refresh button. Today mode suggests a refresh when the route is older than 7 days.
12. Demo mode keeps the mock provider and the "Sample data" note.
13. Line and stop names are shown exactly as TDX returns them, inside translated labels. No machine translation.

Requirements that are not product calls. Every transit view credits 「交通部運輸資料流通服務平臺」 (TDX licence). With no network and no saved route, the modal falls back to the "Open route" Google Maps link.

## Provider

TDX MaaS routing, `GET https://tdx.transportdata.tw/api/maas/routing`. Nationwide bus, MRT, TRA, THSR, light rail, cable car, ferry. The spec states routing calls are not deducted from plan points. Free plan is 5 calls per minute per key, 3 keys per account, 24-hour tokens, server-side calls with caching expected. Google Routes was ruled out because its service terms §19.2 forbid use alongside a non-Google map.

Transitous conditions (usage policy at transitous.org/api). Open-source and non-commercial only, a `User-Agent` naming the app, version and a contact URL, a visible link to `https://transitous.org/sources/`, OpenStreetMap attribution, contact the team before heavy use, best effort with no uptime guarantee. Its Taiwan data comes from TDX feeds, so the TDX credit is shown as well. A probe on 2026-10-19 returned Taipei bus, Taipei MRT, TRA, THSR and Kaohsiung MRT itineraries with line names, stop counts and per-leg minutes, and no fares. One Taipei 101 to Longshan Temple MRT result looked wrong (60 minutes via Banqiao), so quality is unverified.

Open facts that need a TDX key. The per-step contents of `sections` (line, stop count, per-step minutes, fare) and how far ahead `depart` may be. The first implementation step records a real response as a test fixture.

## Round 3 decisions (accepted 2026-10-19)

14. Share-link viewers are anonymous, so they see saved routes and the Open route link but make no new lookups. Revises decisions 2 and 10.
15. A stale chosen route keeps driving the leg's minutes, with a badge and Refresh.
16. Interim provider is Transitous (`https://api.transitous.org/api/v5/plan`), called only from the `transit-routes` edge function, while the TDX account goes through manual review (no Taiwan mobile number). The app is non-commercial and is published under the MIT licence, which Transitous's usage policy requires. TDX replaces it later as a second adapter behind the same function.

Engineering calls made without asking. Provider failures do not count toward the cap. The cap is a rolling 24 hours, like the AI quota. Every leg-minutes consumer goes through `resolveLeg`.

## Throughput checkpoint

- **Blocking first steps.** The synthesized sketch (done). Provider decided (decision 16), so PR 3 is unblocked and builds the Transitous adapter first.
- **Independent workstreams.**
  - PR 1, leg minutes and transit domain. `src/domain/transit.ts`, `src/types.ts`, `src/utils/routing.ts`, `src/utils/schedule.ts`, `src/domain/tripRestoration.ts`, `src/hooks/useTripState.ts` (cascade and dead-scaffolding removal only), `src/components/DayColumn.tsx` (PlaceCard minutes), `src/components/TaiwanMap.tsx` (stale banner removal), `src/utils/applyAiDraft.ts`, `src/i18n.tsx` (dead keys), tests. No user-visible transit yet; planner, warnings and Today agree on minutes.
  - PR 2, the transit sheet and entry points on the mock provider. Depends on PR 1's types.
  - PR 3, edge function, ledger migration and provider adapter. Server-only files, disjoint from PR 1 and 2. Starts once the provider is decided.
- **Shared mutable state.** PR 1 and PR 2 both touch `TransportLegChip`-adjacent files and `src/i18n.tsx`, so PR 2 stacks on PR 1 rather than running in parallel. PR 3 shares no files with either; its only coupling is the `TransitOptionV1` wire type, guarded by a type-equality test added in PR 2.
- **Smallest safe decomposition.** One worker now (PR 1), in its own worktree. PR 2 follows on PR 1's branch. PR 3 runs in parallel once unblocked. Merge order is PR 1 to main first, then retarget PR 2.
