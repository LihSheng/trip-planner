import { useEffect } from 'react';
import {
  Button,
  Group,
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
import { useMediaQuery } from '@mantine/hooks';
import type { Activity, Place, PlaceCategory } from '../types';
import type { ActivityDetailUpdates } from '../domain/activity';
import { PLACE_CATEGORIES } from '../domain/place';

interface ActivityEditorValues {
  title: string;
  category: PlaceCategory;
  durationMinutes: number | string;
  preferredStartTime: string;
  notes: string;
}

interface ActivityEditorModalProps {
  opened: boolean;
  activity?: Activity;
  place?: Place;
  onClose: () => void;
  onSubmit: (activityId: string, updates: ActivityDetailUpdates) => void;
}

export function ActivityEditorModal({
  opened,
  activity,
  place,
  onClose,
  onSubmit,
}: ActivityEditorModalProps) {
  const fullScreen = useMediaQuery('(max-width: 47.99em)');
  const bookingTimingProtected = activity?.booking?.isConfirmed === true;
  const form = useForm<ActivityEditorValues>({
    initialValues: {
      title: '',
      category: 'Landmark',
      durationMinutes: '',
      preferredStartTime: '',
      notes: '',
    },
    validate: {
      title: (value) => value.trim().length < 2 ? 'Enter an activity name.' : null,
      durationMinutes: (value) => {
        if (value === '') return null;
        return typeof value !== 'number' || value < 5 ? 'Use at least 5 minutes.' : null;
      },
    },
  });

  useEffect(() => {
    if (!opened || !activity) return;
    form.setValues({
      title: activity.title,
      category: activity.category ?? place?.category ?? 'Landmark',
      durationMinutes: activity.durationMinutes ?? '',
      preferredStartTime: activity.preferredStartTime ?? '',
      notes: activity.notes ?? '',
    });
    form.resetDirty();
    // Reset only when the selected activity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id, opened]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit activity"
      centered={!fullScreen}
      fullScreen={fullScreen}
      size="lg"
    >
      {!activity ? (
        <Text size="sm" c="dimmed">Select an activity to edit.</Text>
      ) : (
        <form
          onSubmit={form.onSubmit((values) => {
            onSubmit(activity.id, {
              title: values.title,
              category: values.category,
              durationMinutes: typeof values.durationMinutes === 'number' ? values.durationMinutes : undefined,
              preferredStartTime: values.preferredStartTime || undefined,
              notes: values.notes || undefined,
            });
            onClose();
          })}
        >
          <Stack gap="md">
            {place ? (
              <Text size="sm" c="dimmed">
                Place: {place.name}{place.region ? ` · ${place.region}` : ''}
              </Text>
            ) : null}

            {bookingTimingProtected ? (
              <Text size="sm" c="orange">
                This activity has a confirmed booking. Its time and duration are protected here; booking changes will use the dedicated booking editor.
              </Text>
            ) : null}

            <TextInput
              label="Activity name"
              description="Describe what you plan to do. This can differ from the place name."
              placeholder="Visit the observatory"
              required
              {...form.getInputProps('title')}
            />

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select
                label="Category"
                data={[...PLACE_CATEGORIES]}
                allowDeselect={false}
                {...form.getInputProps('category')}
              />
              <NumberInput
                label="Duration"
                description={bookingTimingProtected ? 'Protected by the confirmed booking' : 'Optional planned duration'}
                min={5}
                max={1440}
                step={15}
                suffix=" min"
                placeholder="90"
                disabled={bookingTimingProtected}
                {...form.getInputProps('durationMinutes')}
              />
            </SimpleGrid>

            <TextInput
              label="Preferred start time"
              description={bookingTimingProtected ? 'Protected by the confirmed booking' : 'A planning preference, not a confirmed booking.'}
              type="time"
              disabled={bookingTimingProtected}
              {...form.getInputProps('preferredStartTime')}
            />

            <Textarea
              label="Activity notes"
              placeholder="Tickets, food to try, accessibility notes, or other planning context"
              autosize
              minRows={4}
              {...form.getInputProps('notes')}
            />

            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>Cancel</Button>
              <Button type="submit" color="teal">Save activity</Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
