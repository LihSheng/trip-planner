import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import type { useI18n } from '../i18n';

type Translate = ReturnType<typeof useI18n>['t'];

/** Per device, like the language: whether copied itinerary text lists travel between stops. Off by default. */
const INCLUDE_TRAVEL_KEY = 'trip-planner-copy-include-travel';

export function copyIncludesTravel(): boolean {
  try {
    return localStorage.getItem(INCLUDE_TRAVEL_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useCopyIncludesTravel(): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(copyIncludesTravel);
  const update = (next: boolean) => {
    setValue(next);
    try { localStorage.setItem(INCLUDE_TRAVEL_KEY, String(next)); } catch { /* the toggle still works for this visit */ }
  };
  return [value, update];
}

/** Writes text to the clipboard and says so in a toast, or says the browser refused. */
export async function copyWithToast(text: string, title: string, message: string, t: Translate): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    notifications.show({ color: 'teal', title, message });
    return true;
  } catch {
    notifications.show({ color: 'red', title: t('copyFailed'), message: t('clipboardDenied') });
    return false;
  }
}
