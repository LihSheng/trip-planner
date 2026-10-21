import { describe, expect, it } from 'vitest';
import type { TransitOption } from '../domain/transit';
import { formatTransitText } from './transit';

const t = (key: string, params: Record<string, string | number> = {}) => {
  const en: Record<string, string> = {
    transitOptionNumber: 'Option {number}', routeDuration: '{minutes} min', transitChosen: 'Chosen', transitStops: '{count} stops',
    transitStepWalk: 'Walk', transitStepBus: 'Bus {line}', transitStepMetro: 'Metro {line}',
  };
  return Object.entries(params).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), en[key] ?? key);
};

const bus: TransitOption = {
  signature: 'bus:307',
  minutes: 14,
  steps: [
    { kind: 'walk', minutes: 6 },
    { kind: 'bus', minutes: 8, line: '307', stopCount: 3, fromStop: 'Ximen', toStop: 'Executive Yuan' },
  ],
};
const metro: TransitOption = { signature: 'metro:BL', minutes: 22, steps: [{ kind: 'metro', minutes: 22, line: 'BL', stopCount: 5 }] };

describe('formatTransitText', () => {
  it('writes the leg, saved date, then each option with emoji steps and indented stops', () => {
    const text = formatTransitText({
      title: 'Hotel → Xiaoyoukeng',
      savedOn: 'Saved Oct 21',
      options: [{ option: bus, number: 1, chosen: true }, { option: metro, number: 2, chosen: false }],
    }, t);

    expect(text).toBe([
      'Hotel → Xiaoyoukeng',
      'Saved Oct 21',
      '',
      'Option 1 · 14 min (Chosen)',
      '🚶 Walk · 6 min',
      '🚌 Bus 307 · 3 stops · 8 min',
      '    Ximen → Executive Yuan',
      '',
      'Option 2 · 22 min',
      '🚇 Metro BL · 5 stops · 22 min',
    ].join('\n'));
  });

  it('keeps the option number from the sheet when copying a single option', () => {
    const text = formatTransitText({ title: 'A → B', savedOn: null, options: [{ option: metro, number: 2, chosen: false }] }, t);
    expect(text).toBe('A → B\n\nOption 2 · 22 min\n🚇 Metro BL · 5 stops · 22 min');
  });
});
