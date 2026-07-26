-- Consolidate legacy place.type into the canonical category field stored in trip JSON.
with plans_to_normalize as (
  select id, state
  from public.trip_plans
  where jsonb_typeof(state -> 'places') = 'array'
    and exists (
      select 1
      from jsonb_array_elements(state -> 'places') as candidate(place)
      where candidate.place ? 'type'
    )
),
normalized as (
  select
    plan.id,
    jsonb_agg(
      (candidate.place - 'type') || jsonb_build_object(
        'category',
        case candidate.place ->> 'type'
          when 'hotel' then 'Accommodation'
          when 'airport' then 'Airport'
          when 'station' then 'Station'
          when 'transit' then 'Transit'
          else coalesce(nullif(candidate.place ->> 'category', ''), 'Landmark')
        end
      )
      order by candidate.ordinality
    ) as places
  from plans_to_normalize as plan
  cross join lateral jsonb_array_elements(plan.state -> 'places')
    with ordinality as candidate(place, ordinality)
  group by plan.id
)
update public.trip_plans as trip_plan
set
  state = jsonb_set(trip_plan.state, '{places}', normalized.places, false),
  updated_at = now()
from normalized
where trip_plan.id = normalized.id;
