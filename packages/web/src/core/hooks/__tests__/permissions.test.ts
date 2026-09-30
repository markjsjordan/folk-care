import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePermissions } from '../permissions';
import { useAuthStore } from '../auth';
import type { User } from '../../types/auth';

describe('usePermissions', () => {
  // Reset store before each test
  beforeEach(() => {
    const store = useAuthStore.getState();
    store.clearAuth();
    localStorage.removeItem('auth-storage');
  });

  const createUser = (roles: string[], permissions: string[]): User => ({
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    roles: roles as User['roles'],
    permissions,
    organizationId: 'org-123',
  });

  describe('can', () => {
    it('should return false when user is not authenticated', () => {
      const { result } = renderHook(() => usePermissions());

      expect(result.current.can('read:users')).toBe(false);
    });

    it('should return false when user has no permissions', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['admin'], []), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.can('read:users')).toBe(false);
    });

    it('should return true when user has the permission', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['admin'], ['read:users', 'write:users']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.can('read:users')).toBe(true);
      expect(result.current.can('write:users')).toBe(true);
    });

    it('should return false when user does not have the permission', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['caregiver'], ['read:own-visits']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.can('read:all-users')).toBe(false);
    });

    it('should return true when user has a resource wildcard permission (e.g. "clients:*")', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['org_admin'], ['clients:*', 'billing:*']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.can('clients:read')).toBe(true);
      expect(result.current.can('clients:create')).toBe(true);
      expect(result.current.can('billing:delete')).toBe(true);
      // Wildcard on one resource does not grant another
      expect(result.current.can('caregivers:read')).toBe(false);
    });

    it('should return true for any permission when user has the full wildcard "*:*"', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['super_admin'], ['*:*']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.can('clients:read')).toBe(true);
      expect(result.current.can('admin:access')).toBe(true);
      expect(result.current.can('anything:at-all')).toBe(true);
    });
  });

  describe('canAny', () => {
    it('should return false when user is not authenticated', () => {
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canAny(['read:users', 'write:users'])).toBe(false);
    });

    it('should return true when user has at least one permission', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['viewer'], ['read:users']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canAny(['read:users', 'write:users', 'delete:users'])).toBe(true);
    });

    it('should return false when user has none of the permissions', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['viewer'], ['read:reports']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canAny(['read:users', 'write:users', 'delete:users'])).toBe(false);
    });

    it('should match resource wildcards when checking multiple permissions', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['org_admin'], ['clients:*']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canAny(['clients:read', 'billing:read'])).toBe(true);
    });

    it('should return true with empty permissions array (edge case)', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['admin'], ['read:users']), 'token');

      const { result } = renderHook(() => usePermissions());

      // Array.some returns false for empty arrays
      expect(result.current.canAny([])).toBe(false);
    });
  });

  describe('canAll', () => {
    it('should return false when user is not authenticated', () => {
      const { result } = renderHook(() => usePermissions());

      expect(result.current.canAll(['read:users', 'write:users'])).toBe(false);
    });

    it('should return true when user has all permissions', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['admin'], ['read:users', 'write:users', 'delete:users']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canAll(['read:users', 'write:users'])).toBe(true);
    });

    it('should return false when user is missing one permission', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['viewer'], ['read:users', 'write:users']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canAll(['read:users', 'write:users', 'delete:users'])).toBe(false);
    });

    it('should match resource wildcards when requiring multiple permissions', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['org_admin'], ['clients:*', 'billing:*']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.canAll(['clients:read', 'clients:delete', 'billing:read'])).toBe(true);
    });

    it('should return true with empty permissions array', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['admin'], ['read:users']), 'token');

      const { result } = renderHook(() => usePermissions());

      // Array.every returns true for empty arrays
      expect(result.current.canAll([])).toBe(true);
    });
  });

  describe('hasRole', () => {
    it('should return false when user is not authenticated', () => {
      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasRole('admin')).toBe(false);
    });

    it('should return true when user has the role', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['admin', 'supervisor'], ['all:permissions']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasRole('admin')).toBe(true);
      expect(result.current.hasRole('supervisor')).toBe(true);
    });

    it('should return false when user does not have the role', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['caregiver'], ['read:own-visits']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasRole('admin')).toBe(false);
    });
  });

  describe('hasAnyRole', () => {
    it('should return false when user is not authenticated', () => {
      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasAnyRole(['admin', 'supervisor'])).toBe(false);
    });

    it('should return true when user has at least one role', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['caregiver'], ['read:own-visits']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasAnyRole(['admin', 'caregiver', 'coordinator'])).toBe(true);
    });

    it('should return false when user has none of the roles', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['family'], ['read:family-portal']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasAnyRole(['admin', 'supervisor', 'caregiver'])).toBe(false);
    });

    it('should return false with empty roles array', () => {
      const store = useAuthStore.getState();
      store.setAuth(createUser(['admin'], ['all:permissions']), 'token');

      const { result } = renderHook(() => usePermissions());

      expect(result.current.hasAnyRole([])).toBe(false);
    });
  });

  describe('reactive updates', () => {
    it('should update when auth state changes', () => {
      const { result } = renderHook(() => usePermissions());

      // Initially no permissions
      expect(result.current.can('read:users')).toBe(false);

      // Login
      act(() => {
        const store = useAuthStore.getState();
        store.setAuth(createUser(['admin'], ['read:users']), 'token');
      });

      // Now has permission
      expect(result.current.can('read:users')).toBe(true);

      // Logout
      act(() => {
        const store = useAuthStore.getState();
        store.clearAuth();
      });

      // No longer has permission
      expect(result.current.can('read:users')).toBe(false);
    });
  });

  describe('real-world permission patterns', () => {
    it('should handle caregiver permissions correctly', () => {
      const store = useAuthStore.getState();
      store.setAuth(
        createUser(['caregiver'], [
          'read:own-visits',
          'write:visit-notes',
          'read:own-schedule',
          'write:clock-in-out',
        ]),
        'token'
      );

      const { result } = renderHook(() => usePermissions());

      // Can do caregiver tasks
      expect(result.current.can('read:own-visits')).toBe(true);
      expect(result.current.can('write:clock-in-out')).toBe(true);

      // Cannot do admin tasks
      expect(result.current.can('read:all-visits')).toBe(false);
      expect(result.current.can('manage:caregivers')).toBe(false);

      // Has correct role
      expect(result.current.hasRole('caregiver')).toBe(true);
      expect(result.current.hasRole('admin')).toBe(false);
    });

    it('should handle coordinator permissions correctly', () => {
      const store = useAuthStore.getState();
      store.setAuth(
        createUser(['coordinator'], [
          'read:all-visits',
          'write:schedule',
          'read:caregivers',
          'read:clients',
          'assign:visits',
        ]),
        'token'
      );

      const { result } = renderHook(() => usePermissions());

      // Can view and schedule
      expect(result.current.canAll(['read:all-visits', 'write:schedule', 'assign:visits'])).toBe(true);

      // Has coordinator role
      expect(result.current.hasRole('coordinator')).toBe(true);
      expect(result.current.hasAnyRole(['coordinator', 'supervisor'])).toBe(true);
    });

    it('should handle admin with full permissions', () => {
      const store = useAuthStore.getState();
      store.setAuth(
        createUser(['admin', 'supervisor'], [
          'manage:users',
          'manage:organizations',
          'read:audit-logs',
          'manage:billing',
          'manage:compliance',
        ]),
        'token'
      );

      const { result } = renderHook(() => usePermissions());

      // Can do everything
      expect(result.current.canAny([
        'manage:users',
        'manage:organizations',
        'manage:billing',
      ])).toBe(true);

      // Has admin role
      expect(result.current.hasRole('admin')).toBe(true);
      expect(result.current.hasAnyRole(['admin'])).toBe(true);
    });

    it('should handle a SUPER_ADMIN with resource-wildcard permissions (matches production seed data)', () => {
      const store = useAuthStore.getState();
      store.setAuth(
        createUser(['SUPER_ADMIN'], [
          'organizations:*',
          'users:*',
          'clients:*',
          'caregivers:*',
          'visits:*',
          'schedules:*',
          'care-plans:*',
          'tasks:*',
          'billing:*',
          'reports:*',
          'settings:*',
        ]),
        'token'
      );

      const { result } = renderHook(() => usePermissions());

      // Sidebar-style exact permission checks must resolve via the resource wildcard
      expect(result.current.can('clients:read')).toBe(true);
      expect(result.current.can('caregivers:read')).toBe(true);
      expect(result.current.can('visits:read')).toBe(true);
      expect(result.current.can('billing:read')).toBe(true);

      expect(result.current.hasRole('SUPER_ADMIN')).toBe(true);
    });
  });
});
