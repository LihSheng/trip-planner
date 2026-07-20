import type { CurrencyCode } from '../types';

type CachedRate = { rate: number; updatedAt: number };
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function getTwdExchangeRate(currency: CurrencyCode): Promise<number> {
  const key = `trip-planner:fx:TWD:${currency}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key) ?? 'null') as CachedRate | null;
    if (cached && Date.now() - cached.updatedAt < MAX_AGE_MS) return cached.rate;
  } catch { /* fetch a fresh rate */ }

  const response = await fetch('https://open.er-api.com/v6/latest/TWD');
  if (!response.ok) throw new Error('Unable to load exchange rate.');
  const payload = await response.json() as { result?: string; rates?: Record<string, number> };
  const rate = payload.rates?.[currency];
  if (payload.result !== 'success' || typeof rate !== 'number') throw new Error('Exchange rate is unavailable.');
  localStorage.setItem(key, JSON.stringify({ rate, updatedAt: Date.now() } satisfies CachedRate));
  return rate;
}
