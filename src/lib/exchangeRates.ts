import type { CurrencyCode } from '../types';

type CachedRate = { rate: number; updatedAt: number };
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function getCachedExchangeRate(from: CurrencyCode, to: CurrencyCode): number | null {
  if (from === to) return 1;
  try {
    const cached = JSON.parse(localStorage.getItem(`trip-planner:fx:${from}:${to}`) ?? 'null') as CachedRate | null;
    return typeof cached?.rate === 'number' ? cached.rate : null;
  } catch {
    return null;
  }
}

export async function getTwdExchangeRate(currency: CurrencyCode): Promise<number> {
  return getExchangeRate('TWD', currency);
}

export async function getExchangeRate(from: CurrencyCode, to: CurrencyCode): Promise<number> {
  if (from === to) return 1;
  const key = `trip-planner:fx:${from}:${to}`;
  let cached: CachedRate | null = null;
  try {
    cached = JSON.parse(localStorage.getItem(key) ?? 'null') as CachedRate | null;
    if (cached && Date.now() - cached.updatedAt < MAX_AGE_MS) return cached.rate;
  } catch { /* fetch a fresh rate */ }

  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${from}`);
    if (!response.ok) throw new Error('Unable to load exchange rate.');
    const payload = await response.json() as { result?: string; rates?: Record<string, number> };
    const rate = payload.rates?.[to];
    if (payload.result !== 'success' || typeof rate !== 'number') throw new Error('Exchange rate is unavailable.');
    localStorage.setItem(key, JSON.stringify({ rate, updatedAt: Date.now() } satisfies CachedRate));
    return rate;
  } catch (error) {
    if (cached?.rate) return cached.rate;
    throw error;
  }
}
