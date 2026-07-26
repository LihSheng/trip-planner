# Trip Planning

This context models saved trip locations and the visits arranged across each trip day.

## Language

**Place**:
A saved physical location in a trip, reusable across an itinerary. A Place is not a scheduled visit.
_Avoid_: Stop copy, hotel card

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
