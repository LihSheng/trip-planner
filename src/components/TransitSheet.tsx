import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionIcon, Alert, Anchor, Badge, Button, Group, Loader, Modal, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBus, IconCheck, IconCopy, IconRefresh, IconRoute, IconShip, IconTrain, IconWalk } from '@tabler/icons-react';
import {
  TRANSIT_ATTRIBUTION_URL,
  type LegRef,
  type TransitOption,
  type TransitProviderId,
  type TransitStep,
  type TransitStepKind,
  type TransitSurface,
} from '../domain/transit';
import { useLegTransit } from '../hooks/useLegTransit';
import { useI18n } from '../i18n';
import type { TransitLookupError } from '../lib/transitClient';
import { formatTransitText, summarizeTransitOption, transitStepDetail, transitStepStops, type CopiedTransitOption } from '../utils/transit';

export interface OpenTransitOptions { surface?: TransitSurface }

interface TransitSheetValue { openTransit: (ref: LegRef, options?: OpenTransitOptions) => void }

const TransitSheetContext = createContext<TransitSheetValue | null>(null);

const PROVIDER_NAME: Record<TransitProviderId, string> = { transitous: 'Transitous', mock: 'Mock' };

function stepIcon(kind: TransitStepKind) {
  if (kind === 'walk') return <IconWalk size={16} />;
  if (kind === 'metro' || kind === 'rail' || kind === 'highSpeedRail' || kind === 'tram') return <IconTrain size={16} />;
  if (kind === 'ferry') return <IconShip size={16} />;
  return <IconBus size={16} />;
}

/** Mounted once inside the trip context. Every transit entry point goes through `useTransitSheet`. */
export function TransitSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<{ ref: LegRef; surface: TransitSurface; key: number } | null>(null);
  const openTransit = useCallback((ref: LegRef, options: OpenTransitOptions = {}) => {
    setOpen((current) => ({ ref, surface: options.surface ?? 'planner', key: (current?.key ?? 0) + 1 }));
  }, []);
  const value = useMemo(() => ({ openTransit }), [openTransit]);
  return (
    <TransitSheetContext.Provider value={value}>
      {children}
      {open ? <TransitSheet key={open.key} legRef={open.ref} surface={open.surface} onClose={() => setOpen(null)} /> : null}
    </TransitSheetContext.Provider>
  );
}

/** The only way UI opens transit. */
export function useTransitSheet(): TransitSheetValue {
  const value = useContext(TransitSheetContext);
  if (!value) throw new Error('useTransitSheet must be used inside TransitSheetProvider.');
  return value;
}

function errorText(t: ReturnType<typeof useI18n>['t'], locale: string, error: TransitLookupError) {
  switch (error.kind) {
    case 'limitReached':
      return error.resetsAt
        ? t('transitLimitReached', { time: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(error.resetsAt)) })
        : t('transitLimitReachedNoTime');
    case 'busy': return t('transitBusy');
    case 'offline': return t('transitOffline');
    case 'unavailable': return t('transitUnavailable');
  }
}

function TransitSheet({ legRef, surface, onClose }: { legRef: LegRef; surface: TransitSurface; onClose: () => void }) {
  const { t, locale } = useI18n();
  const leg = useLegTransit(legRef, surface);
  const { resolved, view, request } = leg;
  const saved = view.status === 'saved' ? view.saved : null;
  const provider = saved?.provider ?? leg.lookupProvider;
  const formatDate = (iso: string) => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(iso));
  const chosenSignature = view.status === 'saved' ? view.chosen?.signature : undefined;
  const copyOptions = async (options: CopiedTransitOption[], title: string) => {
    if (!saved || !resolved) return false;
    const text = formatTransitText({
      title: `${resolved.from.name} → ${resolved.to.name}`,
      savedOn: t('transitSavedOn', { date: formatDate(saved.fetchedAt) }),
      options,
    }, t);
    try {
      await navigator.clipboard.writeText(text);
      notifications.show({ color: 'teal', title, message: t('transitCopiedMessage') });
      return true;
    } catch {
      notifications.show({ color: 'red', title: t('copyFailed'), message: t('clipboardDenied') });
      return false;
    }
  };
  const allOptions = saved?.options.map((option, index) => ({ option, number: index + 1, chosen: option.signature === chosenSignature })) ?? [];

  return (
    <Modal opened onClose={onClose} centered title={resolved ? `${resolved.from.name} → ${resolved.to.name}` : t('transitOptions')}>
      {!resolved ? (
        <Text size="sm" c="dimmed">{t('transitLegGone')}</Text>
      ) : view.status === 'ineligible' ? (
        <Text size="sm" c="dimmed">{t('transitIneligible')}</Text>
      ) : (
        <Stack gap="sm">
          {saved || leg.refresh ? (
            <Group justify="space-between" gap="xs">
              <Text size="xs" c="dimmed">{saved ? t('transitSavedOn', { date: formatDate(saved.fetchedAt) }) : null}</Text>
              <Group gap={4} wrap="nowrap">
              {allOptions.length > 1 ? (
                <CopyAction label={t('transitCopyAll')} onCopy={() => copyOptions(allOptions, t('transitCopiedAll', { count: allOptions.length }))} />
              ) : null}
              {leg.refresh ? (
                <Button
                  size="compact-xs"
                  variant={leg.suggestRefresh ? 'light' : 'subtle'}
                  leftSection={<IconRefresh size={14} />}
                  loading={request.status === 'loading'}
                  onClick={leg.refresh}
                >
                  {saved ? t('transitRefresh') : t('transitFind')}
                </Button>
              ) : null}
              </Group>
            </Group>
          ) : null}
          {view.status === 'saved' && view.stale.length > 0 ? (
            <Alert color="orange" variant="light" p="xs">
              <Text size="sm">{t('transitStale')}{view.chosen ? ` ${t('transitStaleChosen')}` : ''}</Text>
            </Alert>
          ) : null}
          {saved?.chosen !== undefined && view.status === 'saved' && !view.chosen ? (
            <Text size="sm" c="orange">{t('transitChosenGone')}</Text>
          ) : null}
          {request.status === 'loading' ? (
            <Group gap="xs"><Loader size="xs" /><Text size="sm" c="dimmed">{t('transitLoading')}</Text></Group>
          ) : null}
          {request.status === 'failed' ? <Text size="sm" c="red">{errorText(t, locale, request.error)}</Text> : null}
          {!saved && !leg.refresh ? <Text size="sm" c="dimmed">{t('transitNoSaved')}</Text> : null}
          {saved && saved.options.length === 0 ? <Text size="sm" c="dimmed">{t('transitEmpty')}</Text> : null}
          {allOptions.map((copied, index) => (
            <OptionCard
              key={copied.option.signature}
              option={copied.option}
              index={index}
              chosen={copied.chosen}
              onCopy={() => copyOptions([copied], t('transitCopiedOption', { number: copied.number }))}
              onChoose={leg.choose ? () => leg.choose!(copied.option.signature) : undefined}
              onClear={leg.choose ? () => leg.choose!(null) : undefined}
            />
          ))}
        </Stack>
      )}
      <Group justify="space-between" mt="md" gap="xs">
        <Attribution provider={provider} />
        {leg.openRouteUrl ? (
          <Anchor size="xs" href={leg.openRouteUrl} target="_blank" rel="noopener noreferrer">
            <Group gap={4} wrap="nowrap"><IconRoute size={14} />{t('openRoute')}</Group>
          </Anchor>
        ) : null}
      </Group>
    </Modal>
  );
}

function Attribution({ provider }: { provider: TransitProviderId | null }) {
  const { t } = useI18n();
  if (!provider) return <span />;
  const url = TRANSIT_ATTRIBUTION_URL[provider];
  if (!url) return <Text size="xs" c="dimmed">{t('transitSampleData')}</Text>;
  return (
    <Anchor size="xs" c="dimmed" href={url} target="_blank" rel="noopener noreferrer">
      {t('transitAttribution', { provider: PROVIDER_NAME[provider] })}
    </Anchor>
  );
}

function OptionCard({ option, index, chosen, onCopy, onChoose, onClear }: {
  option: TransitOption;
  index: number;
  chosen: boolean;
  onCopy: () => Promise<boolean>;
  onChoose?: () => void;
  onClear?: () => void;
}) {
  const { t } = useI18n();
  const headline = summarizeTransitOption(option) || t('transitOptionNumber', { number: index + 1 });
  return (
    <Paper withBorder p="sm" radius="md" className={`transit-option${chosen ? ' transit-option--chosen' : ''}`} aria-label={headline}>
      <Group justify="space-between" wrap="nowrap" mb={6} gap="xs">
        <Text fw={600} size="sm">{headline}</Text>
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>{t('routeDuration', { minutes: option.minutes })}</Text>
          <CopyAction iconOnly label={t('transitCopyOption', { number: index + 1 })} onCopy={onCopy} />
          {chosen ? (
            <Badge color="teal" variant="light" leftSection={<IconCheck size={12} />}>{t('transitChosen')}</Badge>
          ) : onChoose ? (
            <Button size="compact-xs" variant="light" color="teal" onClick={onChoose}>{t('transitChoose')}</Button>
          ) : null}
        </Group>
      </Group>
      <Stack gap={4}>
        {option.steps.map((step, stepIndex) => <StepRow key={stepIndex} step={step} />)}
      </Stack>
      {chosen && onClear ? (
        <Button mt={6} size="compact-xs" variant="subtle" color="gray" onClick={onClear}>{t('transitUseEstimate')}</Button>
      ) : null}
    </Paper>
  );
}

/** Turns its icon into a check for a moment after a successful copy. */
function CopyAction({ label, iconOnly, onCopy }: { label: string; iconOnly?: boolean; onCopy: () => Promise<boolean> }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const run = async () => setCopied(await onCopy());
  const icon = copied ? <IconCheck size={14} /> : <IconCopy size={14} />;
  if (iconOnly) {
    return (
      <Tooltip label={label} withinPortal={false}>
        <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} size="sm" aria-label={label} onClick={run}>{icon}</ActionIcon>
      </Tooltip>
    );
  }
  return <Button size="compact-xs" variant="subtle" color={copied ? 'teal' : undefined} leftSection={icon} onClick={run}>{label}</Button>;
}

function StepRow({ step }: { step: TransitStep }) {
  const { t } = useI18n();
  const detail = transitStepDetail(step, t);
  const stops = transitStepStops(step);
  return (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <Text span c="dimmed" mt={2}>{stepIcon(step.kind)}</Text>
      <div>
        <Text size="sm">{detail}</Text>
        {stops ? <Text size="xs" c="dimmed">{stops}</Text> : null}
      </div>
    </Group>
  );
}
