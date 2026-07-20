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
import type { Place, PlaceCategory, PlaceType } from '../types';
import { categoryLabel, useI18n } from '../i18n';

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
  type: PlaceType;
  opensAt: string;
  closesAt: string;
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
  const { t } = useI18n();
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
      type: 'place',
      opensAt: '',
      closesAt: '',
    },
    validate: {
      name: (value) => (value.trim().length < 2 ? t('enterPlaceName') : null),
      region: (value) => (value.trim().length < 2 ? t('enterRegion') : null),
      latitude: (value) =>
        typeof value !== 'number' || value < -90 || value > 90 ? t('validLatitude') : null,
      longitude: (value) =>
        typeof value !== 'number' || value < -180 || value > 180 ? t('validLongitude') : null,
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
            type: place.type ?? 'place',
            opensAt: place.openingHours?.opensAt ?? '',
            closesAt: place.openingHours?.closesAt ?? '',
          }
        : {
            name: '',
            region: '',
            category: 'Landmark',
            latitude: 25.033,
            longitude: 121.5654,
            notes: '',
            type: 'place',
            opensAt: '',
            closesAt: '',
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
                region: properties.city ?? properties.state ?? properties.country ?? '',
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
    <Modal opened={opened} onClose={onClose} title={place ? t('editPlace') : t('addPlace')} centered>
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
            type: values.type,
            openingHours: values.opensAt && values.closesAt ? { opensAt: values.opensAt, closesAt: values.closesAt } : undefined,
          });
          onClose();
        })}
      >
        <Stack>
          {!place ? (
            <Stack gap={4}>
              <Autocomplete
                label={t('searchForPlace')}
                placeholder={geoapifyApiKey ? t('searchExample') : t('searchDisabled')}
                data={predictions.map((prediction) => prediction.label)}
                value={placeSearch}
                onChange={setPlaceSearch}
                onOptionSubmit={selectPrediction}
                disabled={!geoapifyApiKey}
                rightSection={searching ? <Loader size={16} /> : null}
                description={t('searchDescription')}
              />
              {searchError ? <Text size="xs" c="red">{searchError}</Text> : null}
              {!geoapifyApiKey ? (
                <Text size="xs" c="dimmed">
                  Set VITE_GEOAPIFY_API_KEY in .env.local to enable place search.
                </Text>
              ) : null}
            </Stack>
          ) : null}
          <TextInput label={t('placeName')} placeholder={t('searchExample')} required {...form.getInputProps('name')} />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label={t('regionCity')} placeholder={t('cityPlaceholder')} required {...form.getInputProps('region')} />
            <Select
              label={t('category')}
              data={categoryOptions.map((category) => ({ value: category, label: categoryLabel(t, category) }))}
              allowDeselect={false}
              {...form.getInputProps('category')}
            />
          </SimpleGrid>
          <Select
            label={t('placeType')}
            data={[
              { value: 'place', label: t('typePlace') },
              { value: 'hotel', label: t('typeHotel') },
              { value: 'airport', label: t('typeAirport') },
              { value: 'station', label: t('typeStation') },
              { value: 'transit', label: t('typeTransit') },
            ]}
            allowDeselect={false}
            {...form.getInputProps('type')}
          />
          <SimpleGrid cols={2}>
            <NumberInput label={t('latitude')} decimalScale={6} {...form.getInputProps('latitude')} />
            <NumberInput label={t('longitude')} decimalScale={6} {...form.getInputProps('longitude')} />
          </SimpleGrid>
          <SimpleGrid cols={2}>
            <TextInput label={t('opensAt')} type="time" {...form.getInputProps('opensAt')} />
            <TextInput label={t('closesAt')} type="time" {...form.getInputProps('closesAt')} />
          </SimpleGrid>
          <Textarea
            label={t('notes')}
            placeholder={t('notesPlaceholder')}
            autosize
            minRows={3}
            {...form.getInputProps('notes')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" color="teal">
              {place ? t('saveChanges') : t('addToUnscheduled')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
