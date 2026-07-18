import { useEffect } from 'react';
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
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

export function PlaceFormModal({ opened, place, onClose, onSubmit }: PlaceFormModalProps) {
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
    // Form is intentionally reset only when the modal target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, place?.id]);

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
