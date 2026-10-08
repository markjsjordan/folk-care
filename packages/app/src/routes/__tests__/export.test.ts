/**
 * Export Routes Tests - Regulatory Audit Pack
 *
 * Tests for POST /export/audit-pack:
 * - ZIP archive packaging for state survey & regulatory reviews
 * - Inclusion of clients, EVV logs, caregiver credentials, visit notes, and manifest
 * - HIPAA Security Rule (45 CFR § 164.312(b)) audit logging
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable sonarjs/redundant-type-aliases */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable sonarjs/no-hardcoded-ip */
/* eslint-disable unicorn/no-useless-undefined */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Router } from 'express';

// Type for Express Router stack layer
type RouterLayer = any;

const mockAppend = vi.fn();
const mockPipe = vi.fn();
const mockFinalize = vi.fn().mockResolvedValue(undefined);
const mockOn = vi.fn();

const mockArchiveInstance = {
  append: mockAppend,
  pipe: mockPipe,
  finalize: mockFinalize,
  on: mockOn,
};

vi.mock('archiver', () => {
  const archiverFn = vi.fn().mockImplementation(() => mockArchiveInstance);
  return {
    default: archiverFn,
    ZipArchive: vi.fn().mockImplementation(() => mockArchiveInstance),
  };
});

const mockAuditLogEvent = vi.fn().mockResolvedValue(undefined);

vi.mock('@folkcare/core', async () => {
  const actual = await vi.importActual('@folkcare/core');
  return {
    ...actual,
    asyncHandler: (fn: any) => fn,
    getDatabase: vi.fn().mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    }),
    AuthMiddleware: vi.fn().mockImplementation(function () {
      return {
        requireAuth: (_req: any, _res: any, next: any) => {
          _req.user = {
            userId: '123e4567-e89b-12d3-a456-426614174000',
            organizationId: '223e4567-e89b-12d3-a456-426614174000',
            roles: ['ADMIN'],
            permissions: ['export:all'],
            branchIds: ['branch-1'],
          };
          next();
        },
      };
    }),
    AuditService: vi.fn().mockImplementation(function () {
      return {
        logEvent: mockAuditLogEvent,
      };
    }),
  };
});

import exportRouter from '../export.js';

// Helper to call Express route handlers
async function callHandler(handler: any, req: any, res: any): Promise<void> {
  const next = vi.fn();
  await handler(req, res, next);
}

describe('Export Routes - Regulatory Audit Pack', () => {
  let router: Router;

  beforeEach(() => {
    router = exportRouter;
    mockAppend.mockClear();
    mockPipe.mockClear();
    mockFinalize.mockClear();
    mockOn.mockClear();
    mockAuditLogEvent.mockClear();
  });

  function getAuditPackHandler() {
    const route = (router.stack as RouterLayer[]).find(
      (layer: RouterLayer) => layer.route?.path === '/audit-pack'
    );
    if (!route) {
      throw new Error('Could not find /audit-pack route in exportRouter stack');
    }
    return route.route.stack[route.route.stack.length - 1].handle;
  }

  it('should stream zip archive with correct headers and HIPAA audit logging', async () => {
    const handler = getAuditPackHandler();

    const req = {
      user: {
        userId: 'user-audit-1',
        organizationId: 'org-audit-1',
        roles: ['ADMIN', 'ORG_ADMIN'],
        permissions: ['export:audit'],
        branchIds: ['branch-1'],
      },
      headers: {
        'user-agent': 'Vitest-Agent/1.0',
      },
      ip: '192.168.1.100',
      socket: { remoteAddress: '192.168.1.100' },
      body: {
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        format: 'csv',
        includeEvv: true,
        includeCredentials: true,
        includeNotes: true,
      },
    } as any;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      headersSent: false,
    } as any;

    await callHandler(handler, req, res);

    // Verify ZIP headers
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('attachment; filename="audit-pack-')
    );

    // Verify pipe and finalize called
    expect(mockPipe).toHaveBeenCalledWith(res);
    expect(mockFinalize).toHaveBeenCalled();

    // Verify archive contents appended (clients, evv_logs, caregiver_credentials, visit_notes, manifest.json)
    expect(mockAppend).toHaveBeenCalledWith(expect.any(String), { name: 'clients.csv' });
    expect(mockAppend).toHaveBeenCalledWith(expect.any(String), { name: 'evv_logs.csv' });
    expect(mockAppend).toHaveBeenCalledWith(expect.any(String), { name: 'caregiver_credentials.csv' });
    expect(mockAppend).toHaveBeenCalledWith(expect.any(String), { name: 'visit_notes.csv' });
    expect(mockAppend).toHaveBeenCalledWith(expect.any(String), { name: 'manifest.json' });

    // Verify HIPAA Security Rule audit log event
    expect(mockAuditLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-audit-1',
        organizationId: 'org-audit-1',
      }),
      expect.objectContaining({
        eventType: 'COMPLIANCE',
        action: 'EXPORT_AUDIT_PACK',
        result: 'SUCCESS',
        resource: 'regulatory_audit_pack',
        resourceId: 'org-audit-1',
        metadata: expect.objectContaining({
          startDate: '2026-01-01',
          endDate: '2026-03-31',
          ipAddress: '192.168.1.100',
        }),
      })
    );
  });

  it('should support json format for audit pack', async () => {
    const handler = getAuditPackHandler();

    const req = {
      user: {
        userId: 'user-audit-1',
        organizationId: 'org-audit-1',
        roles: ['ADMIN'],
        permissions: ['export:audit'],
        branchIds: ['branch-1'],
      },
      headers: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      body: {
        format: 'json',
      },
    } as any;

    const res = {
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      headersSent: false,
    } as any;

    await callHandler(handler, req, res);

    expect(mockAppend).toHaveBeenCalledWith(expect.any(String), { name: 'clients.json' });
    expect(mockAppend).toHaveBeenCalledWith(expect.any(String), { name: 'evv_logs.json' });
    expect(mockAppend).toHaveBeenCalledWith(expect.any(String), { name: 'caregiver_credentials.json' });
    expect(mockAppend).toHaveBeenCalledWith(expect.any(String), { name: 'visit_notes.json' });
    expect(mockAppend).toHaveBeenCalledWith(expect.any(String), { name: 'manifest.json' });
    expect(mockFinalize).toHaveBeenCalled();
  });
});
