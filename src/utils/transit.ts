import type { TransitOption } from '../domain/transit';

/**
 * One-line headline for a transit option, shown above its steps so options can be compared at a glance.
 * The sheet falls back to "Option N" when this returns ''.
 */
export function summarizeTransitOption(option: TransitOption): string {
  // TODO(human): build the headline from option.steps (kind, line, stopCount, minutes).
  return '';
}
