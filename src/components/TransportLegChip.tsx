import type { ReactNode } from 'react';
import { Menu, Text, UnstyledButton } from '@mantine/core';
import { IconBus, IconCheck, IconRoute } from '@tabler/icons-react';
import type { TravelMode } from '../types';
import { isPlaceholder } from '../domain/place';
import { useI18n } from '../i18n';
import { legGoogleMapsUrl } from '../utils/mapPresentation';
import type { ResolvedLeg } from '../utils/routing';
import { transportIcon } from './transportIcons';

const MODES: { mode: TravelMode; key: 'publicTransport' | 'walk' | 'bike' | 'car' | 'taxi' | 'otherTransport' }[] = [
  { mode: 'public', key: 'publicTransport' },
  { mode: 'walk', key: 'walk' },
  { mode: 'bike', key: 'bike' },
  { mode: 'car', key: 'car' },
  { mode: 'taxi', key: 'taxi' },
  { mode: 'other', key: 'otherTransport' },
];

function useModeLabel() {
  const { t } = useI18n();
  return (mode: TravelMode) => t(MODES.find((entry) => entry.mode === mode)!.key).toLowerCase();
}

function ModeMenu({ chip, readOnly, dayDefaultMode, hideDefaultItem, routeUrl, onOpenTransit, onChange }: {
  chip: ReactNode;
  readOnly: boolean;
  dayDefaultMode: TravelMode;
  hideDefaultItem: boolean;
  routeUrl?: string;
  onOpenTransit?: () => void;
  onChange: (mode: TravelMode | 'default') => void;
}) {
  const { t } = useI18n();
  const labelFor = useModeLabel();
  if (readOnly) return <>{chip}</>;
  return (
    <Menu position="bottom" shadow="md" withinPortal>
      <Menu.Target>{chip}</Menu.Target>
      <Menu.Dropdown>
        {onOpenTransit ? (
          <>
            <Menu.Item leftSection={<IconBus size={16} />} onClick={onOpenTransit}>{t('transitOptions')}</Menu.Item>
            <Menu.Divider />
          </>
        ) : null}
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

/** The day's default mode, without minutes or a leg. */
export function DayModeChip({ mode, readOnly = false, onChange }: { mode: TravelMode; readOnly?: boolean; onChange: (mode: TravelMode) => void }) {
  const { t } = useI18n();
  const labelFor = useModeLabel();
  const chip = (
    <UnstyledButton className="transport-leg-chip" disabled={readOnly} aria-label={t('routeMode')}>
      {transportIcon(mode)}
      <span>{labelFor(mode)}</span>
    </UnstyledButton>
  );
  return (
    <ModeMenu chip={chip} readOnly={readOnly} dayDefaultMode={mode} hideDefaultItem onChange={(next) => { if (next !== 'default') onChange(next); }} />
  );
}

/** The leg's minutes as a button that opens transit, with a chosen-route mark and a stale dot. */
export function LegMinutesButton({ leg, onClick }: { leg: ResolvedLeg; onClick: () => void }) {
  const { t } = useI18n();
  const chosen = leg.transit.status === 'saved' && leg.transit.chosen !== null;
  const stale = leg.transit.status === 'saved' && leg.transit.stale.length > 0;
  const label = [t('legMinutesLabel', { minutes: leg.minutes ?? 0 }), chosen ? t('transitChosenMark') : null, stale ? t('transitStaleMark') : null]
    .filter(Boolean).join(', ');
  return (
    <UnstyledButton className="leg-minutes-button" onClick={onClick} aria-label={label} title={label}>
      {chosen ? <IconCheck size={12} className="leg-minutes-button__chosen" aria-hidden /> : null}
      <span>{leg.minutes ?? 0} min</span>
      {stale ? <span className="leg-minutes-button__stale" aria-hidden /> : null}
    </UnstyledButton>
  );
}

interface TransportLegChipProps {
  leg: ResolvedLeg;
  dayDefaultMode: TravelMode;
  readOnly?: boolean;
  onChange: (mode: TravelMode | 'default') => void;
  /** Present when the leg can show transit. Adds the menu item and makes the minutes a button, also when read-only. */
  onOpenTransit?: () => void;
}

/** Compact transport pill for the leg between two stops. */
export function TransportLegChip({ leg, dayDefaultMode, readOnly = false, onChange, onOpenTransit }: TransportLegChipProps) {
  const { t } = useI18n();
  const labelFor = useModeLabel();
  const isOverride = leg.legMode !== 'default';
  const context = leg.inside ? t('insideVenue') : leg.relationship === 'same-area' ? t('inArea') : leg.relationship === 'walkable' ? t('nearby') : undefined;
  const routeUrl = !isPlaceholder(leg.from) && !isPlaceholder(leg.to) ? legGoogleMapsUrl(leg.from, leg.to, leg.mode) : undefined;
  const chip = (
    <UnstyledButton
      className={`transport-leg-chip${isOverride ? ' transport-leg-chip--override' : ''}`}
      disabled={readOnly}
      aria-label={t('routeMode')}
    >
      {transportIcon(leg.mode)}
      <span>{labelFor(leg.mode)}{isOverride ? ` ${t('fromHere')}` : ''}</span>
      {!onOpenTransit && leg.minutes !== undefined ? <span>· {leg.minutes} min</span> : null}
      {context ? <Text span size="xs" c="dimmed">{context}</Text> : null}
    </UnstyledButton>
  );
  const menu = (
    <ModeMenu
      chip={chip}
      readOnly={readOnly}
      dayDefaultMode={dayDefaultMode}
      hideDefaultItem={false}
      routeUrl={routeUrl}
      onOpenTransit={onOpenTransit}
      onChange={onChange}
    />
  );
  if (!onOpenTransit) return menu;
  return (
    <span className="transport-leg-chip-group">
      {menu}
      <LegMinutesButton leg={leg} onClick={onOpenTransit} />
    </span>
  );
}
