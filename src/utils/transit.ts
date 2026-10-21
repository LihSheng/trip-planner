import type { TransitOption, TransitStep, TransitStepKind } from '../domain/transit';
import type { TranslationKey } from '../i18n';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

/**
 * One-line headline for a transit option, shown above its steps so options can be compared at a glance.
 * The sheet falls back to "Option N" when this returns ''.
 */
export function summarizeTransitOption(option: TransitOption): string {
  // TODO(human): build the headline from option.steps (kind, line, stopCount, minutes).
  return '';
}

/** Exhaustive: a new TransitStepKind fails the build here. */
export const TRANSIT_STEP_LABEL: Record<TransitStepKind, TranslationKey> = {
  walk: 'transitStepWalk',
  bus: 'transitStepBus',
  tram: 'transitStepTram',
  metro: 'transitStepMetro',
  rail: 'transitStepRail',
  highSpeedRail: 'transitStepHighSpeedRail',
  ferry: 'transitStepFerry',
  cableCar: 'transitStepCableCar',
  other: 'transitStepOther',
};

/** Leads each step in copied text, where the sheet's icons can't go. */
const STEP_EMOJI: Record<TransitStepKind, string> = {
  walk: '🚶',
  bus: '🚌',
  tram: '🚋',
  metro: '🚇',
  rail: '🚆',
  highSpeedRail: '🚄',
  ferry: '⛴️',
  cableCar: '🚡',
  other: '🚏',
};

/** "Bus 307 · 3 stops · 2 min": the sheet's step line, also used for copied text. */
export function transitStepDetail(step: TransitStep, t: Translate): string {
  const name = t(TRANSIT_STEP_LABEL[step.kind], { line: step.line ?? '' }).trim();
  return [name, step.stopCount ? t('transitStops', { count: step.stopCount }) : null, t('routeDuration', { minutes: step.minutes })]
    .filter(Boolean).join(' · ');
}

export function transitStepStops(step: TransitStep): string | null {
  return step.fromStop && step.toStop ? `${step.fromStop} → ${step.toStop}` : null;
}

export interface CopiedTransitOption { option: TransitOption; number: number; chosen: boolean }

/** Plain text for pasting into a chat: the leg, when it was saved, then each option with its steps. */
export function formatTransitText(
  { title, savedOn, options }: { title: string; savedOn: string | null; options: CopiedTransitOption[] },
  t: Translate,
): string {
  const head = savedOn ? `${title}\n${savedOn}` : title;
  const blocks = options.map(({ option, number, chosen }) => {
    const heading = `${summarizeTransitOption(option) || t('transitOptionNumber', { number })} · ${t('routeDuration', { minutes: option.minutes })}${chosen ? ` (${t('transitChosen')})` : ''}`;
    const steps = option.steps.map((step) => {
      const stops = transitStepStops(step);
      return `${STEP_EMOJI[step.kind]} ${transitStepDetail(step, t)}${stops ? `\n    ${stops}` : ''}`;
    });
    return [heading, ...steps].join('\n');
  });
  return [head, ...blocks].join('\n\n');
}
