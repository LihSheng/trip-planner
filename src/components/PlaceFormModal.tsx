import { useEffect, useState } from 'react';
import {
  Autocomplete,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import type { ClusterRelationship, CurrencyCode, LocationCluster, Place, PlaceCategory, StayBooking, TravelMode } from '../types';
import { categoryLabel, useI18n } from '../i18n';
import { PLACE_CATEGORIES, type PlaceDetailsValues, validatePlaceDetails } from '../domain/place';
import { clusterForPlace, distanceMeters, estimatedWalkMinutes, type ClusterAssignment } from '../domain/locationCluster';
import { currencies } from './BookingModals';

type PlaceFormValues = PlaceDetailsValues & { stayCost: number | string; stayCurrency: CurrencyCode };

interface PlaceFormModalProps {
  opened: boolean;
  place?: Place;
  places: Place[];
  clusters?: LocationCluster[];
  onClose: () => void;
  onSubmit: (place: Place, clusterAssignment?: ClusterAssignment) => void;
  stayBookings?: StayBooking[];
  defaultCurrency?: CurrencyCode;
  onSaveStayBooking?: (booking: StayBooking) => void;
  onAddAnotherStay?: (placeId: string) => void;
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
  if (types.some((type) => type.includes('airport') || type.includes('aviation'))) return 'Airport';
  if (types.some((type) => type.includes('railway') || type.includes('train_station') || type.includes('bus_station'))) return 'Station';
  if (types.some((type) => type.includes('public_transport') || type.includes('transit'))) return 'Transit';
  if (types.some((type) => type.startsWith('accommodation.') || type.includes('hotel') || type.includes('hostel') || type.includes('dormitory'))) {
    return 'Accommodation';
  }
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

export function PlaceFormModal({ opened, place, places, clusters, onClose, onSubmit, stayBookings = [], defaultCurrency = 'MYR', onSaveStayBooking, onAddAnotherStay }: PlaceFormModalProps) {
  const { t, locale } = useI18n();
  const [placeSearch, setPlaceSearch] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [clusterTargetId, setClusterTargetId] = useState<string | null>(null);
  const [clusterRelationship, setClusterRelationship] = useState<ClusterRelationship>('walkable');
  const [travelMinutes, setTravelMinutes] = useState<number | undefined>();
  const [clusterTravelMode, setClusterTravelMode] = useState<TravelMode>('public');
  const currentCluster = place ? clusterForPlace(clusters, place.id) : undefined;
  const isClusterAnchor = Boolean(place && currentCluster?.anchorPlaceId === place.id);
  const clusterTargets = places
    .filter((candidate) => candidate.id !== place?.id && !candidate.assignmentOf && !candidate.placeholderKind)
    .filter((candidate, index, candidates) => {
      const anchorId = clusterForPlace(clusters, candidate.id)?.anchorPlaceId ?? candidate.id;
      return candidates.findIndex((item) => (clusterForPlace(clusters, item.id)?.anchorPlaceId ?? item.id) === anchorId) === index;
    })
    .map((candidate) => {
      const anchorId = clusterForPlace(clusters, candidate.id)?.anchorPlaceId ?? candidate.id;
      const anchor = places.find((item) => item.id === anchorId) ?? candidate;
      return { value: anchor.id, label: clusterForPlace(clusters, anchor.id)?.name ?? `${anchor.name} area` };
    });
  const form = useForm<PlaceFormValues>({
    initialValues: {
      name: '',
      region: '',
      category: 'Landmark',
      latitude: 25.033,
      longitude: 121.5654,
      notes: '',
      opensAt: '',
      closesAt: '',
      checkInDate: '',
      checkOutDate: '',
      stayCost: '',
      stayCurrency: defaultCurrency,
    },
    validate: (values) => ({
      ...validatePlaceDetails(values),
      stayCost: values.stayCost !== '' && (typeof values.stayCost !== 'number' || values.stayCost <= 0)
        ? locale === 'zh-TW' ? '請輸入大於零的金額' : 'Use an amount greater than zero'
        : undefined,
    }),
  });

  useEffect(() => {
    if (!opened) return;
    const currentStay = place
      ? stayBookings.find((booking) => booking.placeId === place.id && booking.checkInDate === place.stay?.checkInDate && booking.checkOutDate === place.stay?.checkOutDate)
        ?? stayBookings.find((booking) => booking.placeId === place.id)
      : undefined;
    form.setValues(
      place
        ? {
            name: place.name,
            region: place.region,
            category: place.category,
            latitude: place.latitude,
            longitude: place.longitude,
            notes: place.notes,
            opensAt: place.openingHours?.opensAt ?? '',
            closesAt: place.openingHours?.closesAt ?? '',
            checkInDate: place.stay?.checkInDate ?? '',
            checkOutDate: place.stay?.checkOutDate ?? '',
            stayCost: currentStay?.cost?.amount ?? '',
            stayCurrency: currentStay?.cost?.currency ?? defaultCurrency,
          }
        : {
            name: '',
            region: '',
            category: 'Landmark',
            latitude: 25.033,
            longitude: 121.5654,
            notes: '',
            opensAt: '',
            closesAt: '',
            checkInDate: '',
            checkOutDate: '',
            stayCost: '',
            stayCurrency: defaultCurrency,
          },
    );
    form.resetDirty();
    setPlaceSearch('');
    setPredictions([]);
    setSearchError(null);
    const member = currentCluster?.members.find((item) => item.placeId === place?.id);
    setClusterTargetId(member ? currentCluster?.anchorPlaceId ?? null : null);
    setClusterRelationship(member?.relationship === 'nearby' ? 'walkable' : member?.relationship ?? 'walkable');
    setTravelMinutes(member?.travelMinutes ?? member?.walkMinutes);
    setClusterTravelMode(member?.travelMode ?? 'public');
    // Form is intentionally reset only when the modal target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, place?.id, currentCluster?.id]);

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
    const nearest = places
      .filter((candidate) => !candidate.assignmentOf && !candidate.placeholderKind)
      .map((candidate) => ({ candidate, distance: distanceMeters(prediction, candidate) }))
      .filter((item) => item.distance <= 800)
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearest) {
      const anchorId = clusterForPlace(clusters, nearest.candidate.id)?.anchorPlaceId ?? nearest.candidate.id;
      setClusterTargetId(anchorId);
      setClusterRelationship(nearest.distance <= 75 ? 'inside' : 'walkable');
      setTravelMinutes(estimatedWalkMinutes(nearest.distance));
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={place ? t('editPlace') : t('addPlace')} centered>
      <form
        onSubmit={form.onSubmit((values) => {
          const savedPlace = {
            id: place?.id ?? `place-${crypto.randomUUID()}`,
            name: values.name.trim(),
            region: values.region.trim(),
            category: values.category,
            latitude: Number(values.latitude),
            longitude: Number(values.longitude),
            notes: values.notes.trim(),
            openingHours: values.category === 'Accommodation' ? undefined : values.opensAt && values.closesAt ? { opensAt: values.opensAt, closesAt: values.closesAt } : undefined,
            stay: values.category === 'Accommodation' && values.checkInDate && values.checkOutDate
              ? { checkInDate: values.checkInDate, checkOutDate: values.checkOutDate }
              : undefined,
          };
          onSubmit(savedPlace, clusterTargetId ? {
            targetPlaceId: clusterTargetId,
            relationship: clusterRelationship,
            travelMode: clusterRelationship === 'same-area' ? clusterTravelMode : undefined,
            travelMinutes: clusterRelationship === 'inside' ? undefined : travelMinutes,
          } : undefined);
          if (savedPlace.category === 'Accommodation' && savedPlace.stay && onSaveStayBooking) {
            const existing = stayBookings.find((booking) => booking.placeId === savedPlace.id && booking.checkInDate === savedPlace.stay?.checkInDate && booking.checkOutDate === savedPlace.stay?.checkOutDate)
              ?? stayBookings.find((booking) => booking.placeId === savedPlace.id && booking.id.startsWith(`legacy-stay:${savedPlace.id}:`));
            onSaveStayBooking({
              id: existing?.id ?? `stay-${crypto.randomUUID()}`,
              placeId: savedPlace.id,
              ...savedPlace.stay,
              cost: Number(values.stayCost) > 0 ? { amount: Number(values.stayCost), currency: values.stayCurrency } : undefined,
            });
          }
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
          <Select
            label={t('category')}
            data={PLACE_CATEGORIES.map((category) => ({ value: category, label: categoryLabel(t, category) }))}
            allowDeselect={false}
            {...form.getInputProps('category')}
          />
          <TextInput label={t('placeName')} placeholder={t('searchExample')} required {...form.getInputProps('name')} />
          <TextInput label={t('regionCity')} placeholder={t('cityPlaceholder')} required {...form.getInputProps('region')} />
          <SimpleGrid cols={2}>
            <NumberInput label={t('latitude')} decimalScale={6} {...form.getInputProps('latitude')} />
            <NumberInput label={t('longitude')} decimalScale={6} {...form.getInputProps('longitude')} />
          </SimpleGrid>
          {form.values.category === 'Accommodation' ? (
            <Stack gap="xs">
              <SimpleGrid cols={2}>
                <TextInput label={t('checkInDate')} type="date" {...form.getInputProps('checkInDate')} />
                <TextInput label={t('checkOutDate')} type="date" {...form.getInputProps('checkOutDate')} />
              </SimpleGrid>
              <SimpleGrid cols={2}>
                <NumberInput label={locale === 'zh-TW' ? '整段住宿費用' : 'Total stay cost'} min={0} decimalScale={2} {...form.getInputProps('stayCost')} />
                <Select label={locale === 'zh-TW' ? '貨幣' : 'Currency'} data={currencies} allowDeselect={false} {...form.getInputProps('stayCurrency')} />
              </SimpleGrid>
              {place && onAddAnotherStay ? <Button variant="light" onClick={() => onAddAnotherStay(place.id)}>{locale === 'zh-TW' ? '新增另一段住宿' : 'Add another stay'}</Button> : null}
            </Stack>
          ) : (
            <SimpleGrid cols={2}>
              <TextInput label={t('opensAt')} type="time" {...form.getInputProps('opensAt')} />
              <TextInput label={t('closesAt')} type="time" {...form.getInputProps('closesAt')} />
            </SimpleGrid>
          )}
          <Textarea
            label={t('notes')}
            placeholder={t('notesPlaceholder')}
            autosize
            minRows={3}
            {...form.getInputProps('notes')}
          />
          <Paper withBorder radius="md" p="sm">
            <Stack gap="xs">
              <div>
                <Text size="sm" fw={700}>Location cluster</Text>
                <Text size="xs" c="dimmed">Group activities that happen inside one venue or within a short walk.</Text>
              </div>
              {isClusterAnchor ? (
                <Text size="sm">Anchor for <strong>{currentCluster?.name}</strong>. Choose a replacement before deleting this place.</Text>
              ) : (
                <>
                  <Select
                    label="Group with"
                    placeholder="Independent place"
                    clearable
                    searchable
                    value={clusterTargetId}
                    data={clusterTargets}
                    onChange={(value) => setClusterTargetId(value)}
                  />
                  {clusterTargetId ? (
                    <>
                      <SegmentedControl
                        fullWidth
                        value={clusterRelationship}
                        onChange={(value) => setClusterRelationship(value as ClusterRelationship)}
                        data={[
                          { value: 'inside', label: 'Inside' },
                          { value: 'walkable', label: 'Walkable' },
                          { value: 'same-area', label: 'Same area' },
                        ]}
                      />
                      {clusterRelationship === 'walkable' ? (
                        <NumberInput
                          label="Walking time"
                          suffix=" min"
                          min={1}
                          max={10}
                          value={travelMinutes ?? ''}
                          onChange={(value) => setTravelMinutes(typeof value === 'number' ? value : undefined)}
                        />
                      ) : clusterRelationship === 'same-area' ? (
                        <SimpleGrid cols={2}>
                          <Select
                            label="Transport within area"
                            value={clusterTravelMode}
                            allowDeselect={false}
                            data={[
                              { value: 'public', label: 'Shuttle / bus' },
                              { value: 'car', label: 'Car' },
                              { value: 'taxi', label: 'Taxi' },
                              { value: 'bike', label: 'Bike' },
                              { value: 'walk', label: 'Walk' },
                              { value: 'other', label: 'Other' },
                            ]}
                            onChange={(value) => setClusterTravelMode((value ?? 'public') as TravelMode)}
                          />
                          <NumberInput
                            label="Travel time"
                            suffix=" min"
                            min={1}
                            max={180}
                            value={travelMinutes ?? ''}
                            onChange={(value) => setTravelMinutes(typeof value === 'number' ? value : undefined)}
                          />
                        </SimpleGrid>
                      ) : (
                        <Text size="xs" c="teal">No transportation needed. Displayed as an indoor walk.</Text>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </Stack>
          </Paper>
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
