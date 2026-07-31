import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconCalendar,
  IconCircleCheck,
  IconCircleCheckFilled,
  IconEdit,
  IconExternalLink,
  IconMap,
  IconPlus,
  IconRoute,
  IconTrash,
} from '@tabler/icons-react';
import { divIcon, latLngBounds } from 'leaflet';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import type { Place, PlaceCategory, TripDay } from '../types';
import type { CurrentLocation } from '../hooks/useCurrentLocation';
import { formatTripDate } from '../utils/date';
import { categoryLabel, useI18n } from '../i18n';
import { googleDirectionsUrl, googleMapsRouteUrl, googleSearchUrl, markerColors } from '../utils/mapPresentation';


const geoapifyMapsApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined;

interface TaiwanMapProps {
  places: Place[];
  days: TripDay[];
  unscheduledIds: string[];
  startDate: string;
  selectedId: string | null;
  visitedPlaceIds: string[];
  activeView: string;
  onSelect: (placeId: string) => void;
  onToggleVisited?: (placeId: string) => void;
  onEditPlace: (place: Place) => void;
  onActiveViewChange: (viewId: string) => void;
  onAddDay: () => void;
  onRemoveDay: (dayId: string) => void;
  currentLocation: CurrentLocation | null;
  readOnly?: boolean;
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
    const zoom = Math.max(map.getZoom(), 11);
    const selectedPoint = map.project([selectedPlace.latitude, selectedPlace.longitude], zoom);
    const mobileOffset = window.matchMedia('(max-width: 74.99em)').matches ? map.getSize().y * 0.18 : 0;
    map.flyTo(
      map.unproject(selectedPoint.subtract([0, mobileOffset]), zoom),
      zoom,
      { duration: 0.55 },
    );
  }, [map, selectedPlace, viewChanged]);

  return null;
}

function createMarkerIcon({
  color,
  label,
  selected,
  category,
}: {
  color: string;
  label: string;
  selected: boolean;
  category: PlaceCategory;
}) {
  const accommodation = category === 'Accommodation';
  return divIcon({
    className: 'map-pin-wrapper',
    html: `<div class="map-pin${selected ? ' map-pin--selected' : ''}${accommodation ? ' map-pin--accommodation' : ''}" style="--pin-color:${color}"><span>${accommodation ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>' : label}</span></div>`,
    iconSize: selected ? [42, 48] : [34, 40],
    iconAnchor: selected ? [21, 48] : [17, 40],
    popupAnchor: [0, -40],
  });
}

const PlaceMarker = memo(function PlaceMarker({
  place,
  index,
  activeDay,
  activeView,
  dayByPlaceId,
  selected,
  visited,
  onSelect,
  onToggleVisited,
  onEditPlace,
  currentLocation,
  readOnly,
}: {
  place: Place;
  index: number;
  activeDay?: TripDay;
  activeView: string;
  dayByPlaceId: Map<string, number>;
  selected: boolean;
  visited: boolean;
  onSelect: (placeId: string) => void;
  onToggleVisited?: (placeId: string) => void;
  onEditPlace: (place: Place) => void;
  currentLocation: CurrentLocation | null;
  readOnly: boolean;
}) {
  const { t } = useI18n();
  const dayIndex = dayByPlaceId.get(place.id);
  const label = activeDay ? String(index + 1) : activeView === 'unscheduled' ? 'U' : dayIndex === undefined ? 'U' : String(dayIndex + 1);

  return <Marker
    position={[place.latitude, place.longitude]}
    icon={createMarkerIcon({ color: markerColors[place.category], label, selected, category: place.category })}
    eventHandlers={{ click: () => onSelect(place.id) }}
    zIndexOffset={selected ? 1000 : 0}
  >
    <Popup>
      <Stack gap={4} miw={170}>
        <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
          <Text fw={700} size="sm" lineClamp={1}>{place.name}</Text>
          {onToggleVisited ? <Tooltip label={t('markVisited', { name: place.name })}>
            <ActionIcon
              variant="subtle"
              color={visited ? 'teal' : 'gray'}
              size="sm"
              aria-label={t('markVisited', { name: place.name })}
              aria-pressed={visited}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); onToggleVisited(place.id); }}
            >
              {visited ? <IconCircleCheckFilled size={18} /> : <IconCircleCheck size={18} />}
            </ActionIcon>
          </Tooltip> : null}
        </Group>
        <Group gap={6} wrap="nowrap">
          <Text size="xs" c="dimmed" lineClamp={1}>{place.region}</Text>
          <Badge color={markerColors[place.category]} variant="light" size="xs">{categoryLabel(t, place.category)}</Badge>
          {activeDay ? <Badge size="xs">{t('stop', { number: index + 1 })}</Badge> : null}
        </Group>
        {place.notes ? <Text size="xs" lineClamp={2}>{place.notes}</Text> : null}
        <Group justify="flex-end" gap={2} mt={2}>
          <Tooltip label="Get directions">
            <ActionIcon component="a" href={googleDirectionsUrl(place, currentLocation)} target="_blank" rel="noopener noreferrer" variant="subtle" color="teal" size="sm" aria-label="Get directions"><IconRoute size={15} /></ActionIcon>
          </Tooltip>
          <Tooltip label="Google search">
            <ActionIcon component="a" href={googleSearchUrl(place)} target="_blank" rel="noopener noreferrer" variant="subtle" color="gray" size="sm" aria-label="Google search"><IconExternalLink size={15} /></ActionIcon>
          </Tooltip>
          {!readOnly ? <Tooltip label={t('editPlace')}><ActionIcon variant="subtle" color="gray" size="sm" aria-label={t('editPlace')} onClick={() => onEditPlace(place)}><IconEdit size={15} /></ActionIcon></Tooltip> : null}
        </Group>
      </Stack>
    </Popup>
  </Marker>;
}, (previous, next) => previous.place === next.place
  && previous.index === next.index
  && previous.activeDay === next.activeDay
  && previous.activeView === next.activeView
  && previous.selected === next.selected
  && previous.visited === next.visited
  && previous.currentLocation === next.currentLocation
  && previous.readOnly === next.readOnly);



function MapSurface({
  places,
  days,
  unscheduledIds,
  startDate,
  selectedId,
  visitedPlaceIds = [],
  activeView,
  onSelect,
  onToggleVisited,
  onEditPlace,
  onActiveViewChange,
  onAddDay,
  onRemoveDay,
  currentLocation,
  readOnly = false,
  expanded,
  onToggleExpanded,
}: MapSurfaceProps) {
  const { t } = useI18n();
  const [useOpenStreetMapFallback, setUseOpenStreetMapFallback] = useState(!geoapifyMapsApiKey);
  const [draggedDayId, setDraggedDayId] = useState<string | null>(null);
  const [daySwitcherCollapsed, setDaySwitcherCollapsed] = useState(false);
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

  function selectMapView(viewId: string) {
    if (viewId === activeView) {
      setDaySwitcherCollapsed((collapsed) => !collapsed);
      return;
    }

    setDaySwitcherCollapsed(false);
    onActiveViewChange(viewId);
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
            positions={routePlaces.map((place) => [place.latitude, place.longitude] as [number, number])}
            pathOptions={{ color: '#13a889', weight: 5, opacity: 0.78, dashArray: '10 8', lineCap: 'round' }}
          />
        ) : null}

        {currentLocation ? (
          <>
            <Circle
              center={[currentLocation.latitude, currentLocation.longitude]}
              radius={currentLocation.accuracy}
              pathOptions={{ color: '#228be6', fillColor: '#228be6', fillOpacity: 0.12, weight: 1 }}
              interactive={false}
            />
            <CircleMarker
              center={[currentLocation.latitude, currentLocation.longitude]}
              radius={9}
              pathOptions={{ color: '#ffffff', fillColor: '#228be6', fillOpacity: 1, weight: 3 }}
            >
              <Popup>
                <Text size="sm" fw={700}>Your live location</Text>
              </Popup>
            </CircleMarker>
          </>
        ) : null}

        {visiblePlaces.map((place, index) => <PlaceMarker
          key={place.id}
          place={place}
          index={index}
          activeDay={activeDay}
          activeView={activeView}
          dayByPlaceId={dayByPlaceId}
          selected={place.id === selectedId}
          visited={visitedPlaceIds.includes(place.id)}
          onSelect={onSelect}
          onToggleVisited={onToggleVisited}
          onEditPlace={onEditPlace}
          currentLocation={currentLocation}
          readOnly={readOnly}
        />)}
      </MapContainer>

      <Box className={`map-day-switcher${daySwitcherCollapsed ? ' map-day-switcher--collapsed' : ''}`}>
        <Box className="map-day-switcher__scroll" aria-label={t('itineraryDaySelector')}>
          <Group gap="xs" wrap="nowrap">
            {!daySwitcherCollapsed || activeView === 'all' ? <Button
              size="xs"
              radius="xl"
              variant={activeView === 'all' ? 'filled' : 'white'}
              color="teal"
              leftSection={<IconMap size={14} />}
              rightSection={
                <Badge circle size="sm" variant={activeView === 'all' ? 'white' : 'light'} color="teal">
                  {places.length}
                </Badge>
              }
              onClick={() => selectMapView('all')}
            >
              {t('all')}
            </Button> : null}
            {!daySwitcherCollapsed || activeView === 'unscheduled' ? <Button
              size="xs"
              radius="xl"
              variant={activeView === 'unscheduled' ? 'filled' : 'white'}
              color="gray"
              rightSection={
                <Badge circle size="sm" variant={activeView === 'unscheduled' ? 'white' : 'light'} color="gray">
                  {unscheduledIds.length}
                </Badge>
              }
              onClick={() => selectMapView('unscheduled')}
            >
              {t('unscheduled')}
            </Button> : null}
            {days.map((day, index) => (!daySwitcherCollapsed || activeView === day.id ? (
              <Button
                key={day.id}
                draggable={!readOnly}
                size="xs"
                radius="xl"
                variant={activeView === day.id ? 'filled' : 'white'}
                color={activeView === day.id ? 'teal' : 'dark'}
                leftSection={<IconCalendar size={14} />}
                rightSection={
                  <Badge circle size="sm" variant={activeView === day.id ? 'white' : 'light'} color="teal">
                    {day.placeIds.length}
                  </Badge>
                }
                onClick={() => selectMapView(day.id)}
                onDragStart={readOnly ? undefined : (event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', day.id);
                  setDraggedDayId(day.id);
                }}
                onDragEnd={() => setDraggedDayId(null)}
              >
                {t('day', { number: index + 1 })}
              </Button>
            ) : null))}
            {!readOnly && !daySwitcherCollapsed ? <Tooltip label={t('addItineraryDay')}>
              <ActionIcon
                size="lg"
                radius="xl"
                variant="white"
                color="teal"
                aria-label={t('addItineraryDay')}
                onClick={onAddDay}
              >
                <IconPlus size={17} />
              </ActionIcon>
            </Tooltip> : null}
            {!readOnly && !daySwitcherCollapsed && draggedDayId ? (
              <Tooltip label={t('removeDay')}>
                <ActionIcon
                  size="lg"
                  radius="xl"
                  variant="filled"
                  color="red"
                  className="map-day-delete-target"
                  aria-label={t('removeDay')}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    onRemoveDay(draggedDayId);
                    setDraggedDayId(null);
                  }}
                >
                  <IconTrash size={17} />
                </ActionIcon>
              </Tooltip>
            ) : null}
          </Group>
        </Box>
      </Box>

      <Box className="map-route-summary">
        <Stack gap={2}>
          <Text fw={750} size="sm">
            {activeDay
                ? `${t('day', { number: activeDayIndex + 1 })}: ${activeDay.label || t('untitledDay')}`
              : activeView === 'unscheduled'
                ? t('unscheduledPlaces')
                : t('completeOverview')}
          </Text>
          <Text size="xs" c="dimmed">
            {activeDay
              ? `${formatTripDate(startDate, activeDayIndex)} · ${t('stopsCount', { count: routePlaces.length })}`
              : t('visiblePlaces', { count: visiblePlaces.length })}
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
            {t('openRoute')}
          </Button>
        ) : null}
      </Box>

      <Tooltip label={expanded ? t('exitFullScreen') : t('fullScreenMap')}>
        <ActionIcon
          className="map-expand-button"
          size="lg"
          radius="xl"
          variant="white"
          color="teal"
          aria-label={expanded ? t('exitFullScreen') : t('openFullScreenMap')}
          onClick={onToggleExpanded}
        >
          {expanded ? <IconArrowsMinimize size={18} /> : <IconArrowsMaximize size={18} />}
        </ActionIcon>
      </Tooltip>

      {!visiblePlaces.length ? (
        <Box className="map-empty-state">
          <Text fw={700}>{t('noPlacesView')}</Text>
          <Text size="sm" c="dimmed">
            {t('addOrMovePlace')}
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
