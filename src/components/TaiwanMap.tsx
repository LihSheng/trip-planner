import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconCalendar,
  IconMap,
  IconPlus,
  IconRoute,
} from '@tabler/icons-react';
import { divIcon, latLngBounds } from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { Place, PlaceCategory, TripDay } from '../types';
import { formatTripDate } from '../utils/date';

const markerColors: Record<PlaceCategory, string> = {
  Landmark: '#f08c46',
  Food: '#e85959',
  Nature: '#2f9e70',
  Culture: '#7950f2',
  Shopping: '#339af0',
  Relaxation: '#15aabf',
};

const geoapifyMapsApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined;

interface TaiwanMapProps {
  places: Place[];
  days: TripDay[];
  unscheduledIds: string[];
  startDate: string;
  selectedId: string | null;
  activeView: string;
  onSelect: (placeId: string) => void;
  onActiveViewChange: (viewId: string) => void;
  onAddDay: () => void;
}

interface MapSurfaceProps extends TaiwanMapProps {
  expanded: boolean;
  onToggleExpanded: () => void;
}

function MapSizeController({ expanded }: { expanded: boolean }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(timer);
  }, [expanded, map]);

  return null;
}

function MapViewportController({
  activeView,
  visiblePlaces,
  selectedPlace,
}: {
  activeView: string;
  visiblePlaces: Place[];
  selectedPlace?: Place;
}) {
  const map = useMap();
  const previousView = useRef(activeView);
  const viewChanged = previousView.current !== activeView;

  useEffect(() => {
    if (!visiblePlaces.length) return;

    if (visiblePlaces.length === 1) {
      map.flyTo([visiblePlaces[0].latitude, visiblePlaces[0].longitude], 12, { duration: 0.65 });
    } else {
      map.fitBounds(
        latLngBounds(visiblePlaces.map((place) => [place.latitude, place.longitude] as [number, number])),
        { padding: [64, 64], maxZoom: 12, animate: true, duration: 0.65 },
      );
    }
    previousView.current = activeView;
  }, [activeView, map, visiblePlaces]);

  useEffect(() => {
    if (!selectedPlace || viewChanged) return;
    map.flyTo(
      [selectedPlace.latitude, selectedPlace.longitude],
      Math.max(map.getZoom(), 11),
      { duration: 0.55 },
    );
  }, [map, selectedPlace, viewChanged]);

  return null;
}

function createMarkerIcon({
  color,
  label,
  selected,
}: {
  color: string;
  label: string;
  selected: boolean;
}) {
  return divIcon({
    className: 'map-pin-wrapper',
    html: `<div class="map-pin${selected ? ' map-pin--selected' : ''}" style="--pin-color:${color}"><span>${label}</span></div>`,
    iconSize: selected ? [42, 48] : [34, 40],
    iconAnchor: selected ? [21, 48] : [17, 40],
    popupAnchor: [0, -40],
  });
}

function googleMapsRouteUrl(routePlaces: Place[]) {
  if (!routePlaces.length) return null;
  if (routePlaces.length === 1) {
    const place = routePlaces[0];
    return `https://www.google.com/maps/search/?api=1&query=${place.latitude},${place.longitude}`;
  }

  const origin = routePlaces[0];
  const destination = routePlaces[routePlaces.length - 1];
  const waypoints = routePlaces
    .slice(1, -1)
    .map((place) => `${place.latitude},${place.longitude}`)
    .join('|');
  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    travelmode: 'driving',
  });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function MapSurface({
  places,
  days,
  unscheduledIds,
  startDate,
  selectedId,
  activeView,
  onSelect,
  onActiveViewChange,
  onAddDay,
  expanded,
  onToggleExpanded,
}: MapSurfaceProps) {
  const [useOpenStreetMapFallback, setUseOpenStreetMapFallback] = useState(!geoapifyMapsApiKey);
  const placesById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);
  const dayByPlaceId = useMemo(() => {
    const result = new Map<string, number>();
    days.forEach((day, dayIndex) => day.placeIds.forEach((placeId) => result.set(placeId, dayIndex)));
    return result;
  }, [days]);
  const activeDay = days.find((day) => day.id === activeView);
  const activeDayIndex = activeDay ? days.findIndex((day) => day.id === activeDay.id) : -1;

  const visiblePlaces = useMemo(() => {
    if (activeView === 'all') return places;
    const visibleIds = activeView === 'unscheduled' ? unscheduledIds : activeDay?.placeIds ?? [];
    return visibleIds.flatMap((id) => {
      const place = placesById.get(id);
      return place ? [place] : [];
    });
  }, [activeDay?.placeIds, activeView, places, placesById, unscheduledIds]);

  const routePlaces = useMemo(
    () =>
      activeDay
        ? activeDay.placeIds.flatMap((id) => {
            const place = placesById.get(id);
            return place ? [place] : [];
          })
        : [],
    [activeDay, placesById],
  );
  const selectedPlace = visiblePlaces.find((place) => place.id === selectedId);
  const routeUrl = googleMapsRouteUrl(routePlaces);

  function markerLabel(place: Place, visibleIndex: number) {
    if (activeDay) return String(visibleIndex + 1);
    if (activeView === 'unscheduled') return 'U';
    const dayIndex = dayByPlaceId.get(place.id);
    return dayIndex === undefined ? 'U' : String(dayIndex + 1);
  }

  return (
    <Paper withBorder radius={expanded ? 0 : 'lg'} className={`map-shell${expanded ? ' map-shell--expanded' : ''}`}>
      <MapContainer center={[23.8, 120.95]} zoom={7} minZoom={6} scrollWheelZoom className="taiwan-map">
        <MapSizeController expanded={expanded} />
        <MapViewportController activeView={activeView} visiblePlaces={visiblePlaces} selectedPlace={selectedPlace} />
        <TileLayer
          key={useOpenStreetMapFallback ? 'osm-fallback' : 'geoapify-primary'}
          attribution={
            useOpenStreetMapFallback
              ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              : 'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | <a href="https://openmaptiles.org/">© OpenMapTiles</a> | <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> contributors'
          }
          url={
            useOpenStreetMapFallback
              ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              : `https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${geoapifyMapsApiKey}`
          }
          maxZoom={useOpenStreetMapFallback ? 19 : 20}
          eventHandlers={{ tileerror: () => setUseOpenStreetMapFallback(true) }}
        />

        {routePlaces.length > 1 ? (
          <Polyline
            positions={routePlaces.map((place) => [place.latitude, place.longitude])}
            pathOptions={{ color: '#13a889', weight: 5, opacity: 0.78, dashArray: '10 8', lineCap: 'round' }}
          />
        ) : null}

        {visiblePlaces.map((place, index) => {
          const selected = place.id === selectedId;
          return (
            <Marker
              key={place.id}
              position={[place.latitude, place.longitude]}
              icon={createMarkerIcon({ color: markerColors[place.category], label: markerLabel(place, index), selected })}
              eventHandlers={{ click: () => onSelect(place.id) }}
              zIndexOffset={selected ? 1000 : 0}
            >
              <Popup>
                <Stack gap={5} miw={170}>
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Text fw={700} size="sm">
                      {place.name}
                    </Text>
                    {activeDay ? <Badge size="xs">Stop {index + 1}</Badge> : null}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {place.region}
                  </Text>
                  <Badge color={markerColors[place.category]} variant="light" size="xs" w="fit-content">
                    {place.category}
                  </Badge>
                  {place.notes ? (
                    <Text size="xs" lineClamp={2}>
                      {place.notes}
                    </Text>
                  ) : null}
                </Stack>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <Box className="map-day-switcher">
        <ScrollArea type="never" scrollbarSize={0} offsetScrollbars>
          <Group gap="xs" wrap="nowrap">
            <Button
              size="xs"
              radius="xl"
              variant={activeView === 'all' ? 'filled' : 'white'}
              color="teal"
              leftSection={<IconMap size={14} />}
              onClick={() => onActiveViewChange('all')}
            >
              All · {places.length}
            </Button>
            <Button
              size="xs"
              radius="xl"
              variant={activeView === 'unscheduled' ? 'filled' : 'white'}
              color="gray"
              onClick={() => onActiveViewChange('unscheduled')}
            >
              Unscheduled · {unscheduledIds.length}
            </Button>
            {days.map((day, index) => (
              <Button
                key={day.id}
                size="xs"
                radius="xl"
                variant={activeView === day.id ? 'filled' : 'white'}
                color={activeView === day.id ? 'teal' : 'dark'}
                leftSection={<IconCalendar size={14} />}
                onClick={() => onActiveViewChange(day.id)}
              >
                Day {index + 1} · {day.placeIds.length}
              </Button>
            ))}
            <Tooltip label="Add itinerary day">
              <ActionIcon
                size="lg"
                radius="xl"
                variant="white"
                color="teal"
                aria-label="Add itinerary day"
                onClick={onAddDay}
              >
                <IconPlus size={17} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </ScrollArea>
      </Box>

      <Box className="map-route-summary">
        <Stack gap={2}>
          <Text fw={750} size="sm">
            {activeDay
              ? `Day ${activeDayIndex + 1}: ${activeDay.label || 'Untitled day'}`
              : activeView === 'unscheduled'
                ? 'Unscheduled places'
                : 'Complete trip overview'}
          </Text>
          <Text size="xs" c="dimmed">
            {activeDay
              ? `${formatTripDate(startDate, activeDayIndex)} · ${routePlaces.length} stops`
              : `${visiblePlaces.length} places visible`}
          </Text>
        </Stack>
        {routeUrl ? (
          <Button
            size="xs"
            variant="light"
            color="teal"
            leftSection={<IconRoute size={15} />}
            onClick={() => window.open(routeUrl, '_blank', 'noopener,noreferrer')}
          >
            Open route
          </Button>
        ) : null}
      </Box>

      <Tooltip label={expanded ? 'Exit full screen' : 'Full screen map'}>
        <ActionIcon
          className="map-expand-button"
          size="lg"
          radius="xl"
          variant="white"
          color="teal"
          aria-label={expanded ? 'Exit full screen map' : 'Open full screen map'}
          onClick={onToggleExpanded}
        >
          {expanded ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
        </ActionIcon>
      </Tooltip>

      {!visiblePlaces.length ? (
        <Box className="map-empty-state">
          <Text fw={700}>No places in this view</Text>
          <Text size="sm" c="dimmed">
            Add a place or move one into this itinerary day.
          </Text>
        </Box>
      ) : null}
    </Paper>
  );
}

export function TaiwanMap(props: TaiwanMapProps) {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded((value) => !value);

  if (expanded) {
    return (
      <Modal
        opened
        onClose={() => setExpanded(false)}
        fullScreen
        withCloseButton={false}
        styles={{
          header: { display: 'none' },
          body: { height: '100%', padding: 0 },
          content: { height: '100%' },
        }}
      >
        <MapSurface {...props} expanded onToggleExpanded={toggleExpanded} />
      </Modal>
    );
  }

  return <MapSurface {...props} expanded={false} onToggleExpanded={toggleExpanded} />;
}
