import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import type { Place, PlaceCategory } from '../types';

const categoryOptions: PlaceCategory[] = [
  'Landmark',
  'Food',
  'Nature',
  'Culture',
  'Shopping',
  'Relaxation',
];

interface PlaceFormValues {
  name: string;
  region: string;
  category: PlaceCategory;
  latitude: number | string;
  longitude: number | string;
  notes: string;
}

interface PlaceFormModalProps {
  opened: boolean;
  place?: Place;
  onClose: () => void;
  onSubmit: (place: Place) => void;
}

interface PlacePrediction {
  placeId: string;
  label: string;
  region: string;
  latitude: number;
  longitude: number;
  category: PlaceCategory;
}

interface GeoapifyProperties {
  place_id?: string;
  name?: string;
  formatted?: string;
  city?: string;
  state?: string;
  country?: string;
  lat?: number;
  lon?: number;
  categories?: string[];
}

const geoapifyApiKey = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined;

function categoryFromGeoapifyTypes(types: string[] = []): PlaceCategory {
  if (types.some((type) => type.startsWith('catering.'))) return 'Food';
  if (types.some((type) => type.startsWith('natural.') || type.includes('park') || type.includes('beach'))) return 'Nature';
  if (types.some((type) => type.startsWith('entertainment.') || type.includes('museum') || type.includes('culture'))) {
    return 'Culture';
  }
  if (types.some((type) => type.startsWith('commercial.'))) return 'Shopping';
  if (types.some((type) => type.startsWith('leisure.') || type.includes('spa') || type.includes('hot_spring'))) {
    return 'Relaxation';
  }
  return 'Landmark';
}

async function geoapifyApiError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
  return payload?.message ?? payload?.error ?? `${fallback} (HTTP ${response.status})`;
}

export function PlaceFormModal({ opened, place, onClose, onSubmit }: PlaceFormModalProps) {
  const [placeSearch, setPlaceSearch] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const form = useForm<PlaceFormValues>({
    initialValues: {
      name: '',
      region: '',
      category: 'Landmark',
      latitude: 25.033,
      longitude: 121.5654,
      notes: '',
    },
    validate: {
      name: (value) => (value.trim().length < 2 ? 'Enter a place name' : null),
      region: (value) => (value.trim().length < 2 ? 'Enter a region or city' : null),
      latitude: (value) =>
        typeof value !== 'number' || value < -90 || value > 90 ? 'Use a valid latitude' : null,
      longitude: (value) =>
        typeof value !== 'number' || value < -180 || value > 180 ? 'Use a valid longitude' : null,
    },
  });

  useEffect(() => {
    if (!opened) return;
    form.setValues(
      place
        ? {
            name: place.name,
            region: place.region,
            category: place.category,
            latitude: place.latitude,
            longitude: place.longitude,
            notes: place.notes,
          }
        : {
            name: '',
            region: '',
            category: 'Landmark',
            latitude: 25.033,
            longitude: 121.5654,
            notes: '',
          },
    );
    form.resetDirty();
    setPlaceSearch('');
    setPredictions([]);
    setSearchError(null);
    // Form is intentionally reset only when the modal target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, place?.id]);

  useEffect(() => {
    if (!opened || place || !geoapifyApiKey || placeSearch.trim().length < 3) {
      setPredictions([]);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({
          text: placeSearch.trim(),
          limit: '5',
          lang: 'en',
          filter: 'countrycode:tw',
          format: 'geojson',
          apiKey: geoapifyApiKey,
        });
        const response = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`,
          {
          signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error(await geoapifyApiError(response, 'Geoapify place search failed'));
        const payload = (await response.json()) as { features?: Array<{ properties?: GeoapifyProperties }> };
        setPredictions(
          (payload.features ?? []).flatMap((feature) => {
            const properties = feature.properties;
            if (!properties?.place_id || !properties.name || typeof properties.lat !== 'number' || typeof properties.lon !== 'number') {
              return [];
            }
            return [
              {
                placeId: properties.place_id,
                label: properties.formatted ?? properties.name,
                region: properties.city ?? properties.state ?? properties.country ?? 'Taiwan',
                latitude: properties.lat,
                longitude: properties.lon,
                category: categoryFromGeoapifyTypes(properties.categories),
              },
            ];
          }),
        );
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSearchError(
            `${error instanceof Error ? error.message : 'Geoapify place search failed'}. You can still enter the details manually.`,
          );
          setPredictions([]);
        }
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [opened, place, placeSearch]);

  function selectPrediction(label: string) {
    const prediction = predictions.find((item) => item.label === label);
    if (!prediction) return;
    form.setValues({
      name: prediction.label.split(',')[0],
      region: prediction.region,
      category: prediction.category,
      latitude: prediction.latitude,
      longitude: prediction.longitude,
      notes: form.values.notes,
    });
    setPlaceSearch(prediction.label);
    setPredictions([]);
  }

  return (
    <Modal opened={opened} onClose={onClose} title={place ? 'Edit place' : 'Add a place'} centered>
      <form
        onSubmit={form.onSubmit((values) => {
          onSubmit({
            id: place?.id ?? `place-${crypto.randomUUID()}`,
            name: values.name.trim(),
            region: values.region.trim(),
            category: values.category,
            latitude: Number(values.latitude),
            longitude: Number(values.longitude),
            notes: values.notes.trim(),
          });
          onClose();
        })}
      >
        <Stack>
          {!place ? (
            <Stack gap={4}>
              <Autocomplete
                label="Search for a place"
                placeholder={geoapifyApiKey ? 'e.g. Raohe Night Market' : 'Add a Geoapify API key to enable search'}
                data={predictions.map((prediction) => prediction.label)}
                value={placeSearch}
                onChange={setPlaceSearch}
                onOptionSubmit={selectPrediction}
                disabled={!geoapifyApiKey}
                rightSection={searching ? <Loader size={16} /> : null}
                description="Search Taiwan places and fill the coordinates automatically."
              />
              {searchError ? <Text size="xs" c="red">{searchError}</Text> : null}
              {!geoapifyApiKey ? (
                <Text size="xs" c="dimmed">
                  Set VITE_GEOAPIFY_API_KEY in .env.local to enable place search.
                </Text>
              ) : null}
            </Stack>
          ) : null}
          <TextInput label="Place name" placeholder="e.g. Raohe Night Market" required {...form.getInputProps('name')} />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label="Region or city" placeholder="Taipei" required {...form.getInputProps('region')} />
            <Select
              label="Category"
              data={categoryOptions}
              allowDeselect={false}
              {...form.getInputProps('category')}
            />
          </SimpleGrid>
          <SimpleGrid cols={2}>
            <NumberInput label="Latitude" decimalScale={6} {...form.getInputProps('latitude')} />
            <NumberInput label="Longitude" decimalScale={6} {...form.getInputProps('longitude')} />
          </SimpleGrid>
          <Textarea
            label="Notes"
            placeholder="Food to try, ideal visiting time, transport notes..."
            autosize
            minRows={3}
            {...form.getInputProps('notes')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" color="teal">
              {place ? 'Save changes' : 'Add to unscheduled'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
