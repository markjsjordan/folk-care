/**
 * Staff inbox tests: HIPAA minimum-necessary scoping, tenant isolation, auditing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FamilyEngagementService } from '../services/family-engagement-service.js';
import type { UserContext } from '@folkcare/core';

const THREAD = {
  id: 'thread-1',
  branchId: 'branch-1',
  assignedToUserId: 'cg-1',
  organizationId: 'org-1',
};

function ctx(roles: string[], overrides: Partial<UserContext> = {}): UserContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    roles,
    branchIds: ['branch-1'],
    permissions: [],
    ...overrides,
  } as UserContext;
}

describe('FamilyEngagementService staff inbox', () => {
  let service: FamilyEngagementService;
  let messageRepo: any;
  let audit: any;

  beforeEach(() => {
    messageRepo = {
      getStaffInbox: vi.fn().mockResolvedValue([]),
      getThreadByIdForOrganization: vi.fn().mockResolvedValue(THREAD),
      getMessagesInThread: vi.fn().mockResolvedValue([]),
      markThreadReadByStaff: vi.fn().mockResolvedValue(undefined),
    };
    audit = { logDataAccess: vi.fn().mockResolvedValue(undefined) };
    service = new FamilyEngagementService(
      { findById: vi.fn().mockResolvedValue({ id: 'fam-1', userId: 'user-1' }) } as any,
      {} as any,
      {} as any,
      messageRepo,
      { hasPermission: vi.fn().mockReturnValue(true) } as any,
      {} as any,
      {} as any,
      {} as any,
      audit
    );
  });

  it('gives org admins an org-wide inbox', async () => {
    await service.getStaffInbox(ctx(['ORG_ADMIN']));
    expect(messageRepo.getStaffInbox).toHaveBeenCalledWith('org-1', {}, undefined);
  });

  it('limits coordinators to their branches', async () => {
    await service.getStaffInbox(ctx(['COORDINATOR']));
    expect(messageRepo.getStaffInbox).toHaveBeenCalledWith(
      'org-1',
      { branchIds: ['branch-1'] },
      undefined
    );
  });

  it('limits caregivers to threads assigned to them', async () => {
    await service.getStaffInbox(ctx(['CAREGIVER'], { userId: 'cg-1' }));
    expect(messageRepo.getStaffInbox).toHaveBeenCalledWith(
      'org-1',
      { assignedToUserId: 'cg-1' },
      undefined
    );
  });

  it('rejects family users from the staff inbox', async () => {
    await expect(service.getStaffInbox(ctx(['FAMILY']))).rejects.toThrow('permissions');
  });

  it('audits inbox listings', async () => {
    await service.getStaffInbox(ctx(['ORG_ADMIN']));
    expect(audit.logDataAccess).toHaveBeenCalledWith(
      expect.anything(),
      'message_thread',
      'org-1',
      'SEARCH',
      expect.objectContaining({ scope: 'staff-inbox' })
    );
  });

  it('hides threads from other organizations as not found', async () => {
    messageRepo.getThreadByIdForOrganization.mockResolvedValue(null);
    await expect(service.getMessagesInThread('thread-1', ctx(['ORG_ADMIN']))).rejects.toThrow(
      'not found'
    );
  });

  it('hides unassigned threads from caregivers', async () => {
    await expect(
      service.getMessagesInThread('thread-1', ctx(['CAREGIVER'], { userId: 'cg-2' }))
    ).rejects.toThrow('not found');
  });

  it('includes internal notes and marks read for staff, with audit', async () => {
    await service.getMessagesInThread('thread-1', ctx(['ORG_ADMIN']));
    expect(messageRepo.getMessagesInThread).toHaveBeenCalledWith('thread-1', true);
    expect(messageRepo.markThreadReadByStaff).toHaveBeenCalledWith('thread-1', 'user-1');
    expect(audit.logDataAccess).toHaveBeenCalled();
  });

  it('never returns internal notes to family users', async () => {
    await service.getMessagesInThread('thread-1', ctx(['FAMILY']));
    expect(messageRepo.getMessagesInThread).toHaveBeenCalledWith('thread-1', false);
    expect(messageRepo.markThreadReadByStaff).not.toHaveBeenCalled();
  });
});
