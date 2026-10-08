import { Menu, Text, UnstyledButton } from '@mantine/core';
import { IconRoute } from '@tabler/icons-react';
import type { TravelMode } from '../types';
import { useI18n } from '../i18n';
import { transportIcon } from './transportIcons';

const MODES: { mode: TravelMode; key: 'publicTransport' | 'walk' | 'bike' | 'car' | 'taxi' | 'otherTransport' }[] = [
  { mode: 'public', key: 'publicTransport' },
  { mode: 'walk', key: 'walk' },
  { mode: 'bike', key: 'bike' },
  { mode: 'car', key: 'car' },
  { mode: 'taxi', key: 'taxi' },
  { mode: 'other', key: 'otherTransport' },
];

interface TransportLegChipProps {
  mode: TravelMode;
  dayDefaultMode: TravelMode;
  isOverride: boolean;
  minutes?: number;
  context?: string;
  readOnly?: boolean;
  routeUrl?: string;
  /** When true, the menu omits the "Day default" and "Open route" entries (used for the day default chip). */
  hideDefaultItem?: boolean;
  onChange: (mode: TravelMode | 'default') => void;
}

/** Compact transport pill shared by the day summary and the legs between stops. */
export function TransportLegChip({ mode, dayDefaultMode, isOverride, minutes, context, readOnly = false, routeUrl, hideDefaultItem = false, onChange }: TransportLegChipProps) {
  const { t } = useI18n();
  const labelFor = (m: TravelMode) => t(MODES.find((entry) => entry.mode === m)!.key).toLowerCase();
  const chip = (
    <UnstyledButton
      className={`transport-leg-chip${isOverride ? ' transport-leg-chip--override' : ''}`}
      disabled={readOnly}
      aria-label={t('routeMode')}
    >
      {transportIcon(mode)}
      <span>{labelFor(mode)}{isOverride ? ` ${t('fromHere')}` : ''}</span>
      {minutes !== undefined ? <span>· {minutes} min</span> : null}
      {context ? <Text span size="xs" c="dimmed">{context}</Text> : null}
    </UnstyledButton>
  );
  if (readOnly) return chip;
  return (
    <Menu position="bottom" shadow="md" withinPortal>
      <Menu.Target>{chip}</Menu.Target>
      <Menu.Dropdown>
        {!hideDefaultItem ? (
          <>
            <Menu.Item leftSection={transportIcon(dayDefaultMode)} rightSection={<Text size="xs" c="dimmed">{labelFor(dayDefaultMode)}</Text>} onClick={() => onChange('default')}>{t('dayDefault')}</Menu.Item>
            <Menu.Divider />
          </>
        ) : null}
        {MODES.map((entry) => (
          <Menu.Item key={entry.mode} leftSection={transportIcon(entry.mode)} onClick={() => onChange(entry.mode)}>{t(entry.key)}</Menu.Item>
        ))}
        {routeUrl ? (
          <>
            <Menu.Divider />
            <Menu.Item component="a" href={routeUrl} target="_blank" rel="noopener noreferrer" leftSection={<IconRoute size={16} />}>{t('openRoute')}</Menu.Item>
          </>
        ) : null}
      </Menu.Dropdown>
    </Menu>
  );
}
