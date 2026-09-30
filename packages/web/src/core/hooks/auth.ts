import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthState, User } from '../types/auth';

interface AuthStore extends AuthState {
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
}

/**
 * Safe storage wrapper for zustand persist.
 *
 * Falls back to an in-memory store when `localStorage` is unavailable or
 * throws — private browsing, storage disabled, a non-browser (SSR)
 * environment, or a transient environment teardown race in tests — so
 * auth state transitions never throw. Persistence is best-effort, not
 * required for the store to work.
 */
const memoryFallback = new Map<string, string>();

function tryLocalStorage<T>(operation: (storage: Storage) => T, fallback: () => T): T {
  try {
    if (typeof globalThis.localStorage === 'undefined') {
      return fallback();
    }
    return operation(globalThis.localStorage);
  } catch {
    return fallback();
  }
}

const safeStorage = createJSONStorage<AuthStore>(() => ({
  getItem: (key: string) =>
    tryLocalStorage(
      (storage) => storage.getItem(key),
      () => memoryFallback.get(key) ?? null
    ),
  setItem: (key: string, value: string) =>
    tryLocalStorage(
      (storage) => storage.setItem(key, value),
      () => {
        memoryFallback.set(key, value);
      }
    ),
  removeItem: (key: string) =>
    tryLocalStorage(
      (storage) => storage.removeItem(key),
      () => {
        memoryFallback.delete(key);
      }
    ),
}));

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: (user, token) =>
        set({ user, token, isAuthenticated: true }),
      clearAuth: () =>
        set({ user: null, token: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
      storage: safeStorage,
    }
  )
);

export const useAuth = () => {
  const { user, token, isAuthenticated, setAuth, clearAuth } = useAuthStore();

  return {
    user,
    token,
    isAuthenticated,
    login: setAuth,
    logout: clearAuth,
  };
};
