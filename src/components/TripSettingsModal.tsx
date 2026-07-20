import { useEffect } from 'react';
import { Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useI18n } from '../i18n';
import type { CurrencyCode } from '../types';

interface TripSettingsModalProps {
  opened: boolean;
  tripName: string;
  startDate: string;
  displayCurrency: CurrencyCode;
  onClose: () => void;
  onSubmit: (tripName: string, startDate: string, displayCurrency: CurrencyCode) => void;
}

export function TripSettingsModal({
  opened,
  tripName,
  startDate,
  displayCurrency,
  onClose,
  onSubmit,
}: TripSettingsModalProps) {
  const { t } = useI18n();
  const form = useForm({
    initialValues: { tripName, startDate, displayCurrency },
    validate: {
      tripName: (value) => (value.trim().length < 2 ? t('enterTripName') : null),
      startDate: (value) => (!value ? t('chooseStartDate') : null),
    },
  });

  useEffect(() => {
    if (opened) form.setValues({ tripName, startDate, displayCurrency });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, tripName, startDate, displayCurrency]);

  return (
    <Modal opened={opened} onClose={onClose} title={t('tripSettings')} centered>
      <form
        onSubmit={form.onSubmit((values) => {
          onSubmit(values.tripName.trim(), values.startDate, values.displayCurrency as CurrencyCode);
          onClose();
        })}
      >
        <Stack>
          <TextInput label={t('tripName')} required {...form.getInputProps('tripName')} />
          <TextInput label={t('startDate')} type="date" required {...form.getInputProps('startDate')} />
          <Select label="Home currency" description="Show converted spending below your trip-currency total." data={[
            { value: 'MYR', label: 'MYR — Malaysian ringgit' }, { value: 'SGD', label: 'SGD — Singapore dollar' }, { value: 'USD', label: 'USD — US dollar' }, { value: 'EUR', label: 'EUR — Euro' }, { value: 'JPY', label: 'JPY — Japanese yen' }, { value: 'CNY', label: 'CNY — Chinese yuan' }, { value: 'AUD', label: 'AUD — Australian dollar' }, { value: 'GBP', label: 'GBP — British pound' },
          ]} required {...form.getInputProps('displayCurrency')} />
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
