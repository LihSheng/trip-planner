import { useEffect } from 'react';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';

interface TripSettingsModalProps {
  opened: boolean;
  tripName: string;
  startDate: string;
  onClose: () => void;
  onSubmit: (tripName: string, startDate: string) => void;
}

export function TripSettingsModal({
  opened,
  tripName,
  startDate,
  onClose,
  onSubmit,
}: TripSettingsModalProps) {
  const form = useForm({
    initialValues: { tripName, startDate },
    validate: {
      tripName: (value) => (value.trim().length < 2 ? 'Enter a trip name' : null),
      startDate: (value) => (!value ? 'Choose a start date' : null),
    },
  });

  useEffect(() => {
    if (opened) form.setValues({ tripName, startDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, tripName, startDate]);

  return (
    <Modal opened={opened} onClose={onClose} title="Trip settings" centered>
      <form
        onSubmit={form.onSubmit((values) => {
          onSubmit(values.tripName.trim(), values.startDate);
          onClose();
        })}
      >
        <Stack>
          <TextInput label="Trip name" required {...form.getInputProps('tripName')} />
          <TextInput label="Start date" type="date" required {...form.getInputProps('startDate')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" color="teal">
              Save trip
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
