import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@vitest/browser/matchers';
import '@testing-library/jest-dom/vitest';

// Mock Sentry modules to prevent loading native .node files during tests
vi.mock('@sentry/profiling-node', () => ({}));
vi.mock('@sentry-internal/node-cpu-profiler', () => ({}));

// Cleanup after each test case
afterEach(() => {
  cleanup();
});

/**
 * Guard against a transient happy-dom environment teardown race where the
 * global `localStorage` can briefly be undefined at the start of a test
 * file, most often under concurrent test execution (e.g. `turbo run test`
 * across the whole monorepo). happy-dom is expected to always provide a
 * working localStorage; if it's missing, install an in-memory polyfill so
 * tests that call `localStorage.setItem/getItem/removeItem` directly in
 * `beforeEach` don't crash with "Cannot read properties of undefined".
 */
beforeEach(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const memoryStorage = new Map<string, string>();
    const polyfill: Storage = {
      get length() {
        return memoryStorage.size;
      },
      clear: () => memoryStorage.clear(),
      getItem: (key: string) => memoryStorage.get(key) ?? null,
      key: (index: number) => Array.from(memoryStorage.keys())[index] ?? null,
      removeItem: (key: string) => {
        memoryStorage.delete(key);
      },
      setItem: (key: string, value: string) => {
        memoryStorage.set(key, value);
      },
    };
    Object.defineProperty(globalThis, 'localStorage', {
      value: polyfill,
      writable: true,
      configurable: true,
    });
  }
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Sentry modules to prevent .node file loading
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  setUser: vi.fn(),
  setTag: vi.fn(),
  addBreadcrumb: vi.fn(),
  configureScope: vi.fn(),
  withScope: vi.fn(),
  getCurrentHub: vi.fn(() => ({
    getClient: vi.fn(),
    getScope: vi.fn(),
  })),
}));

vi.mock('@sentry/tracing', () => ({
  Integrations: {
    BrowserTracing: vi.fn(),
  },
}));

vi.mock('@sentry-internal/node-cpu-profiler', () => ({}));
vi.mock('@sentry/profiling-node', () => ({}));
vi.mock('@sentry/node-core', () => ({}));
vi.mock('@sentry-internal/tracing', () => ({}));
vi.mock('sentry_cpu_profiler', () => ({}));
