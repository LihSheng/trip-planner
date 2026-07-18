import { useEffect, useState } from 'react';
import { ActionIcon, Badge, Box, Group, Modal, Paper, Stack, Text, ThemeIcon, Tooltip } from '@mantine/core';
import { IconArrowsMaximize, IconArrowsMinimize, IconMapPin } from '@tabler/icons-react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { Place, PlaceCategory } from '../types';

const markerColors: Record<PlaceCategory, string> = {
  Landmark: '#f08c46',
  Food: '#e85959',
  Nature: '#2f9e70',
  Culture: '#7950f2',
  Shopping: '#339af0',
  Relaxation: '#15aabf',
};

const geoapifyMapsApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined;

function SelectedPlaceController({ place }: { place?: Place }) {
  const map = useMap();

  useEffect(() => {
    if (place) map.flyTo([place.latitude, place.longitude], Math.max(map.getZoom(), 10), { duration: 0.7 });
  }, [map, place]);

  return null;
}

function MapSizeController({ expanded }: { expanded: boolean }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(timer);
  }, [expanded, map]);

  return null;
}

interface TaiwanMapProps {
  places: Place[];
  selectedId: string | null;
  onSelect: (placeId: string) => void;
}

interface MapSurfaceProps extends TaiwanMapProps {
  expanded: boolean;
  onToggleExpanded: () => void;
}

function MapSurface({ places, selectedId, onSelect, expanded, onToggleExpanded }: MapSurfaceProps) {
  const selected = places.find((place) => place.id === selectedId);
  const [useOpenStreetMapFallback, setUseOpenStreetMapFallback] = useState(!geoapifyMapsApiKey);

  return (
    <Paper withBorder radius={expanded ? 0 : 'lg'} className={`map-shell${expanded ? ' map-shell--expanded' : ''}`}>
      <MapContainer
        center={[23.8, 120.95]}
        zoom={7}
        minZoom={6}
        scrollWheelZoom
        className="taiwan-map"
      >
        <MapSizeController expanded={expanded} />
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
        <SelectedPlaceController place={selected} />
        {places.map((place) => {
          const selectedMarker = place.id === selectedId;
          const color = markerColors[place.category];
          return (
            <CircleMarker
              key={place.id}
              center={[place.latitude, place.longitude]}
              radius={selectedMarker ? 11 : 8}
              pathOptions={{
                color: '#ffffff',
                weight: selectedMarker ? 4 : 3,
                fillColor: color,
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onSelect(place.id) }}
            >
              <Popup>
                <Stack gap={5} miw={150}>
                  <Text fw={700} size="sm">
                    {place.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {place.region}
                  </Text>
                  <Badge color={markerColors[place.category]} variant="light" size="xs">
                    {place.category}
                  </Badge>
                </Stack>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <Box className={`map-floating-label${expanded ? ' map-floating-label--expanded' : ''}`}>
        <Group gap="xs" wrap="nowrap" justify="space-between">
          <Group gap="xs" wrap="nowrap">
            {!expanded ? (
              <ThemeIcon color="teal" variant="light" radius="xl" size="md">
                <IconMapPin size={16} />
              </ThemeIcon>
            ) : null}
            <Stack gap={0}>
              <Text fw={700} size="sm">
                {expanded ? 'Taiwan map' : 'Taiwan overview'}
              </Text>
              {!expanded ? (
                <Text c="dimmed" size="xs">
                  Select a marker to inspect a place
                </Text>
              ) : null}
            </Stack>
          </Group>
          <Tooltip label={expanded ? 'Shrink map' : 'Enlarge map'}>
            <ActionIcon
              variant="subtle"
              color="teal"
              aria-label={expanded ? 'Shrink map' : 'Enlarge map'}
              onClick={onToggleExpanded}
            >
              {expanded ? <IconArrowsMinimize size={17} /> : <IconArrowsMaximize size={17} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>
    </Paper>
  );
}

export function TaiwanMap({ places, selectedId, onSelect }: TaiwanMapProps) {
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
        <MapSurface
          places={places}
          selectedId={selectedId}
          onSelect={onSelect}
          expanded
          onToggleExpanded={toggleExpanded}
        />
      </Modal>
    );
  }

  return (
    <MapSurface
      places={places}
      selectedId={selectedId}
      onSelect={onSelect}
      expanded={false}
      onToggleExpanded={toggleExpanded}
    />
  );
}
