import { useEffect, useState } from 'react';
import { Box, Button, Group, Modal, NativeSelect, Paper, Stack, Switch, Text, TextInput, useMantineTheme } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { type Locale, useI18n } from '../i18n';
import type { CurrencyCode } from '../types';
import type { CurrentLocationState } from '../hooks/useCurrentLocation';

interface TripSettingsModalProps {
  opened: boolean;
  tripName: string;
  startDate: string;
  displayCurrency: CurrencyCode;
  location: CurrentLocationState;
  onClose: () => void;
  onSubmit: (tripName: string, startDate: string, displayCurrency: CurrencyCode) => void;
}

export function TripSettingsModal({
  opened,
  tripName,
  startDate,
  displayCurrency,
  location,
  onClose,
  onSubmit,
}: TripSettingsModalProps) {
  const { locale, setLocale, t } = useI18n();
  const theme = useMantineTheme();
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.lg})`);
  const liveLocationDisabled = location.isLoading || location.permission === 'unsupported';
  const [stopLocationConfirmOpened, setStopLocationConfirmOpened] = useState(false);
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

  function setLiveLocation(enabled: boolean) {
    if (liveLocationDisabled) return;
    if (enabled) location.startTracking();
    else setStopLocationConfirmOpened(true);
  }

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={t('tripSettings')}
        centered={!isMobile}
        fullScreen={isMobile}
        classNames={{
          content: 'trip-settings-modal__content',
          header: 'trip-settings-modal__header',
          body: 'trip-settings-modal__body',
        }}
      >
        <form
        className="trip-settings-modal__form"
        onSubmit={form.onSubmit((values) => {
          onSubmit(values.tripName.trim(), values.startDate, values.displayCurrency as CurrencyCode);
          onClose();
        })}
      >
        <Stack className="trip-settings-modal__fields" gap="lg">
          <Stack gap="xs">
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">Trip</Text>
            <Paper withBorder radius="md" p="md">
              <Stack gap="md">
                <TextInput label={t('tripName')} required {...form.getInputProps('tripName')} />
                <TextInput label={t('startDate')} type="date" required {...form.getInputProps('startDate')} />
                <NativeSelect label="Home currency" description="Show converted spending below your trip-currency total." data={[
                  { value: 'MYR', label: 'MYR — Malaysian ringgit' }, { value: 'SGD', label: 'SGD — Singapore dollar' }, { value: 'USD', label: 'USD — US dollar' }, { value: 'EUR', label: 'EUR — Euro' }, { value: 'JPY', label: 'JPY — Japanese yen' }, { value: 'CNY', label: 'CNY — Chinese yuan' }, { value: 'AUD', label: 'AUD — Australian dollar' }, { value: 'GBP', label: 'GBP — British pound' },
                ]} required {...form.getInputProps('displayCurrency')} />
              </Stack>
            </Paper>
          </Stack>
          <Stack gap="xs">
            <Text size="xs" fw={800} c="dimmed" tt="uppercase">System</Text>
            <Paper withBorder radius="md" p="md">
              <NativeSelect
                label={t('language')}
                description="Choose the language used throughout the planner."
                value={locale}
                data={[{ value: 'en', label: 'English' }, { value: 'zh-TW', label: '繁中' }]}
                onChange={({ currentTarget }) => setLocale(currentTarget.value as Locale)}
              />
            </Paper>
            <Paper withBorder radius="md" p="md">
              <Box
                className="trip-settings-modal__location-row"
                role="button"
                tabIndex={liveLocationDisabled ? -1 : 0}
                aria-disabled={liveLocationDisabled}
                onClick={() => setLiveLocation(!location.isTracking)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setLiveLocation(!location.isTracking);
                  }
                }}
              >
                <Switch
                  label="Live location"
                  description={location.isTracking
                    ? 'Using your location for navigation origins.'
                    : location.permission === 'denied'
                      ? 'Enable location access in your browser settings to use this feature.'
                      : 'Use your device location for navigation origins.'}
                  error={location.error}
                  checked={location.isTracking}
                  disabled={liveLocationDisabled}
                  onClick={(event) => event.stopPropagation()}
                  onChange={({ currentTarget }) => setLiveLocation(currentTarget.checked)}
                />
              </Box>
            </Paper>
          </Stack>
        </Stack>
        <Group justify="flex-end" className="trip-settings-modal__actions">
          <Button variant="subtle" color="gray" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" color="teal">
            {t('saveTrip')}
          </Button>
        </Group>
        </form>
      </Modal>
      <Modal
        opened={stopLocationConfirmOpened}
        onClose={() => setStopLocationConfirmOpened(false)}
        title="Turn off live location?"
        centered
      >
        <Stack gap="lg">
          <Text size="sm">Navigation will no longer use your current location as its starting point.</Text>
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setStopLocationConfirmOpened(false)}>Keep on</Button>
            <Button color="red" onClick={() => {
              location.stopTracking();
              setStopLocationConfirmOpened(false);
            }}>
              Turn off
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
