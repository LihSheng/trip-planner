import type { MantineProviderProps } from '@mantine/core';
import { cleanup } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, vi } from 'vitest';

afterEach(cleanup);

// Mantine's Transition schedules rAF + setTimeout even under env="test"; one firing after a file's
// jsdom teardown fails the run with "window is not defined". Respecting reduced motion (matched
// below in matchMedia) makes every transition zero-length, so no timer is ever scheduled.
vi.mock('@mantine/core', async (importOriginal) => {
  const mantine = await importOriginal<typeof import('@mantine/core')>();
  const MantineProvider = (props: MantineProviderProps) =>
    createElement(mantine.MantineProvider, { ...props, theme: { ...props.theme, respectReducedMotion: true } });
  return { ...mantine, MantineProvider };
});

Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:test', writable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, writable: true });

const values = new Map<string, string>();
const storage: Storage = {
  get length() { return values.size; },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => { values.delete(key); },
  setItem: (key, value) => { values.set(key, String(value)); },
};
Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub });
