# Trip Planning

This context models saved trip locations and the visits arranged across each trip day.

## Language

**Place**:
A saved physical location in a trip, reusable across an itinerary. A Place is not a scheduled visit.
_Avoid_: Stop copy, hotel card

**LocationCluster**:
An ordered set of Places that can be visited at one venue or within a short walk, identified by one anchor Place.
_Avoid_: Folder, collection, place group

**Cluster relationship**:
A member Place is inside the anchor venue, walkable from it, or part of the same wider area where transport may be required. The anchor itself has no relationship label.
_Avoid_: Transport mode, category

**ItineraryEntry**:
One scheduled visit to a Place in a trip day. Multiple entries may reference the same Place, including repeated accommodation visits.
_Avoid_: Place assignment, duplicated place

**Remove visit**:
Removal of one ItineraryEntry. It does not remove the referenced Place or any other visits.

**Remove place everywhere**:
Removal of a Place and all ItineraryEntries that reference it. This is a destructive, confirmed action.

**Stay-date override**:
An ItineraryEntry for an Accommodation outside its check-in and check-out dates. A traveller may create it only after confirming a warning.

**Visit policy**:
A normal Place has one movable ItineraryEntry. An Accommodation may have multiple ItineraryEntries across or within trip days.

**DayTask**:
A lightweight checklist item owned by one trip day. It is separate from places and scheduled visits.
_Avoid_: Todo card, planned stop

**Overdue task**:
An incomplete DayTask owned by a day before the selected Today day. It keeps its original day until a traveller moves or deletes it.

**Booking cost**:
A consolidated expense attached to one reservation, independent of how many itinerary days display that hotel or flight. A round-trip flight booking has one total cost; separate reservations remain separate costs.
_Avoid_: Per-day hotel cost, planner-card expense
