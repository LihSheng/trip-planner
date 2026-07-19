import { useEffect } from 'react';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useI18n } from '../i18n';

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
  const { t } = useI18n();
  const form = useForm({
    initialValues: { tripName, startDate },
    validate: {
      tripName: (value) => (value.trim().length < 2 ? t('enterTripName') : null),
      startDate: (value) => (!value ? t('chooseStartDate') : null),
    },
  });

  useEffect(() => {
    if (opened) form.setValues({ tripName, startDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, tripName, startDate]);

  return (
    <Modal opened={opened} onClose={onClose} title={t('tripSettings')} centered>
      <form
        onSubmit={form.onSubmit((values) => {
          onSubmit(values.tripName.trim(), values.startDate);
          onClose();
        })}
      >
        <Stack>
          <TextInput label={t('tripName')} required {...form.getInputProps('tripName')} />
          <TextInput label={t('startDate')} type="date" required {...form.getInputProps('startDate')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" color="teal">
              {t('saveTrip')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
