import { useEffect } from 'react';
import { Badge, Box, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconMapPin } from '@tabler/icons-react';
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

function SelectedPlaceController({ place }: { place?: Place }) {
  const map = useMap();

  useEffect(() => {
    if (place) map.flyTo([place.latitude, place.longitude], Math.max(map.getZoom(), 10), { duration: 0.7 });
  }, [map, place]);

  return null;
}

interface TaiwanMapProps {
  places: Place[];
  selectedId: string | null;
  onSelect: (placeId: string) => void;
}

export function TaiwanMap({ places, selectedId, onSelect }: TaiwanMapProps) {
  const selected = places.find((place) => place.id === selectedId);

  return (
    <Paper withBorder radius="lg" className="map-shell">
      <MapContainer
        center={[23.8, 120.95]}
        zoom={7}
        minZoom={6}
        scrollWheelZoom
        className="taiwan-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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

      <Box className="map-floating-label">
        <Group gap="xs" wrap="nowrap">
          <ThemeIcon color="teal" variant="light" radius="xl" size="md">
            <IconMapPin size={16} />
          </ThemeIcon>
          <Stack gap={0}>
            <Text fw={700} size="sm">
              Taiwan overview
            </Text>
            <Text c="dimmed" size="xs">
              Select a marker to inspect a place
            </Text>
          </Stack>
        </Group>
      </Box>
    </Paper>
  );
}
