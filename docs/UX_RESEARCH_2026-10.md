# UX research: how travellers could get more from Trip Planner

Date: 2026-10-08. Based on a walkthrough of the demo trip on desktop (1440px) and mobile (375px), a read of `src/App.tsx`, the planner, Today and map components, and public coverage of Wanderlog, TripIt, Stippl and Google Maps "Ask Maps".

## 1. Where the product stands

Strengths the market leaders do not all have:

- Map-first planning with per-leg transport modes and ghost days. Wanderlog is the only mainstream rival with a comparable map, and reviewers still complain its routing times "don't make sense".
- A real in-trip mode (Today) with current/next stop, skip, complete, tasks and expenses in one place. Industry guides list "ignoring the in-trip experience" as the most common travel-app mistake.
- Review-first AI import that never writes directly to the trip. Google's Ask Maps and Stippl's AI both get criticised for confidently wrong places; the review step is a differentiator worth making visible.
- Collaboration, read-only share links, multi-currency budget, bilingual UI, demo mode without sign-up. "Forcing account creation before showing value" is the top drop-off cause cited in travel UX guides, and this app already avoids it.

## 2. Gaps versus the market

| Capability | Wanderlog | TripIt | Stippl | Google Maps | This app |
|---|---|---|---|---|---|
| Offline itinerary | Pro | Yes | Pro | Offline maps | No (no service worker, no manifest) |
| Booking email / PDF import | Partial | Core strength | Partial | No | No (manual flight/stay forms) |
| Route optimisation ("best order") | Pro | No | Auto-reroute | Ask Maps | No |
| Undo | Yes | n/a | Partial | n/a | No |
| Packing / pre-trip checklist | Yes | No | Yes | No | Only per-day tasks |
| Bill splitting between collaborators | Yes (2026) | No | Yes | No | No |
| Guides / inspiration feed | Yes | No | Yes | Yes | No |
| Installable mobile app (PWA) | Native | Native | Native | Native | Web only |

## 3. Observed UX friction in the current build

Observed in the demo trip, not hypothetical.

1. **Planner day cards hide the day's shape.** On desktop each day is a compact card listing stop names only. Time of day, travel time between stops and warnings only appear after expanding a day and enabling time management. Rival timelines show the gap between stops as its own row so the day's arithmetic stays visible.
2. **Today view has no timeline context above the fold.** The first screen is two large cards (current, up next) with "No fixed time". The timeline, tasks and spending are far below. On mobile the traveller must scroll past both cards to see what else is planned.
3. **Four parallel ways to reach the same place.** Map side panel, Places tab, Planner card, Today card each open different editors (PlaceDetails, PlaceFormModal, ActivityEditorModal). The mental model "which editor am I in" is never explained.
4. **Map side panel wastes vertical space.** "Selected place" header plus details uses a third of the width for one card; the Places list is a separate tab, so you cannot see the list and the selected place together.
5. **Mobile map hides the map.** At 375px the map gets about 40% of the viewport; the floating place card and the duplicated details card below take the rest. Two copies of "Taipei 101 · Landmark" are visible at once.
6. **Mobile nav uses icons only.** The five bottom-nav items render icons with no labels at 375px (labels exist in code but are hidden by the CSS). Today, Places and Planner are easy to confuse.
7. **No undo after destructive or drag actions.** Drag between days, skip, delete and "move overdue tasks" are all one-way. Notifications confirm the action but offer no "Undo".
8. **Empty states are passive.** Expenses shows a single grey line; a new trip shows an empty map and "Add your first place". Neither points at the fastest path (Import with AI, add a hotel first, set a budget).
9. **Collaboration is invisible until a conflict.** The only collaboration UI is the conflict modal, which shows raw JSON paths. There are no presence indicators, no "who changed this", and the activity log is behind a drawer.
10. **Workspace tabs duplicate the mobile nav but differ.** Desktop has Today/Map/Planner/Expenses; mobile adds Places. Users switching devices get a different map of the product.

## 4. Recommendations, ranked by traveller impact against effort

### Tier 1: in-trip reliability (highest impact)

- **Offline-first Today mode.** Add a PWA manifest plus a service worker that precaches the shell and the current trip JSON. Show a persistent online/offline badge in the header. Guides are unanimous that offline is "table stakes" and that manual "download for offline" toggles fail because people forget; cache the active trip automatically.
- **Time-aware Today header.** Replace "No fixed time" with the next concrete anchor: "Leave by 14:10 to reach Jiufen before 15:30 (bus, 55 min)". The data exists in `schedule.ts` (travel estimates, opening hours); the Today page just does not surface it.
- **"Running late" re-flow.** One tap to shift the rest of the day from now, keeping booked anchors pinned. This is the single most-requested in-trip feature in the design studies found, and the warning engine already knows which stops break.
- **Undo toast everywhere.** Keep the last reversible action in state and add an "Undo" button to the existing Mantine notification. Covers drag, skip, delete, task carry-over.

### Tier 2: planning clarity

- **Timeline day view.** In the planner, render each stop with start time, duration bar and a travel-time row between stops (mode icon, minutes). Keep the compact card as the collapsed state. Warnings become inline, not a count.
- **Unify the place editors.** One drawer with tabs (Details, Schedule, Bookings, Notes) opened from every surface. Removes the three-modal confusion.
- **Map + list together on desktop.** Make the side panel a list with the selected item expanded in place, rather than two tabs. Hovering a list row highlights the pin.
- **Suggest best order.** A nearest-neighbour reorder for one day, offered as a preview the user accepts, in the spirit of the AI-import review step. Wanderlog charges for this.

### Tier 3: before and after the trip

- **Booking capture.** Paste a confirmation email or upload a PDF, route through the existing AI import Edge Function with a "booking" draft type, so flights and stays stop being manual forms. TripIt's whole business is this.
- **Trip-level checklist and packing list.** The day-task model generalises; add a trip-level list with templates by trip type.
- **Expense splitting.** Each expense gets "paid by" and "split between" collaborators; the Expenses page shows who owes whom. Wanderlog shipped this in 2026, Stippl has it.
- **Guided empty states.** First-run cards: "Import from notes", "Add where you are staying", "Set a budget". Expenses empty state should offer "Add stay cost" and "Add flight cost".

### Tier 4: polish

- Labels on the mobile bottom nav (or a labelled 3-item nav plus a "More" sheet).
- Consistent tab set across desktop and mobile.
- Presence avatars and "edited by" chips on day cards; plain-language conflict modal ("Day 2 title: yours vs Alice's").
- Reduced-motion and keyboard support: the only keyboard handling today is Enter in three inputs.

## 5. Suggested first sprint

1. Undo toast (small, touches `useTripPlanner` and notifications).
2. Today header with next-anchor timing (reuses `schedule.ts`).
3. Mobile nav labels and desktop/mobile tab parity.
4. PWA manifest and precache of the active trip.

Each is independent and improves the in-trip experience, which is where this product already leads the market.

## Sources

- Wanderlog features and pricing: https://www.endlesstravelplans.com/guides/planning-tools/wanderlog-review , https://apppricinglab.com/app/apple/1476732439 , https://www.apkmirror.com/apk/wanderlog/wanderlog-trip-planner-app/
- Wanderlog user feedback analysis: https://kimola.com/reports/unlock-insights-wanderlog-trip-planner-app-feedback-analysis-google-play-nl-145736
- Wanderlog vs TripIt (vendor-authored): https://wanderlog.com/blog/2024/11/26/wanderlog-vs-tripit
- TripIt alternatives: https://www.usecarly.com/blog/tripit-alternatives/
- Stippl vs Wanderlog (vendor-authored): https://www.stippl.io/blog/stippl-vs-wanderlog
- Stippl listing: https://apppricinglab.com/app/apple/6443617088
- Google Maps Ask Maps: https://www.ubergizmo.com/2026/07/google-maps-gets-ask-maps-gemini-ai-to-plan-your-travels/ , https://www.thestar.com.my/tech/tech-news/2026/05/07/opinion-a-tech-writer-puts-googles-ai-to-the-test-as-a-trip-planner
- Offline travel app guidance: https://weareaffective.com/learning-centre/should-my-travel-app-work-offline-for-international-travellers
- Travel app UX patterns: https://www.saasfactor.co/blogs/travel-mobile-app-design-ideas , https://www.altexsoft.com/blog/mobile/tours-and-attractions-mobile-applications-best-practices-and-examples-of-ta-apps/
- Reschedule-when-late study: https://wikis.mit.edu/confluence/x/Vj3oB
