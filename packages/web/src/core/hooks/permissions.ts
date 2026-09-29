import { useAuth } from './auth';
import type { Role } from '../types/auth';

export interface UsePermissionsReturn {
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  canAll: (permissions: string[]) => boolean;
  hasRole: (role: string) => boolean;
  hasAnyRole: (roles: string[]) => boolean;
}

/**
 * Check a single permission against a user's permission list, honoring
 * wildcard grants. Mirrors the matching semantics of
 * PermissionService.hasPermission on the backend (packages/core/src/permissions/permission-service.ts)
 * so a user's stored permissions (e.g. "clients:*", "*:*") are recognized
 * the same way on both sides instead of requiring an exact string match.
 */
function matchesPermission(userPermissions: string[], permission: string): boolean {
  // Full wildcard grants everything
  if (userPermissions.includes('*:*')) {
    return true;
  }

  // Exact match
  if (userPermissions.includes(permission)) {
    return true;
  }

  // Resource wildcard (e.g. "clients:*" matches "clients:read")
  const [resource] = permission.split(':');
  return userPermissions.includes(`${resource}:*`);
}

export const usePermissions = (): UsePermissionsReturn => {
  const { user } = useAuth();

  const can = (permission: string): boolean => {
    if (!user?.permissions) return false;
    return matchesPermission(user.permissions, permission);
  };

  const canAny = (permissions: string[]): boolean => {
    if (!user?.permissions) return false;
    return permissions.some((permission) => matchesPermission(user.permissions, permission));
  };

  const canAll = (permissions: string[]): boolean => {
    if (!user?.permissions) return false;
    return permissions.every((permission) => matchesPermission(user.permissions, permission));
  };

  const hasRole = (role: string): boolean => {
    if (!user?.roles) return false;
    return user.roles.includes(role as Role);
  };

  const hasAnyRole = (roles: string[]): boolean => {
    if (!user?.roles) return false;
    return roles.some((role) => user.roles.includes(role as Role));
  };

  return {
    can,
    canAny,
    canAll,
    hasRole,
    hasAnyRole,
  };
};
