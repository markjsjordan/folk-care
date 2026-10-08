/**
 * Import Routes Tests
 *
 * Tests for bulk data import API endpoints with file upload support.
 */

/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable sonarjs/redundant-type-aliases */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Database } from '@folkcare/core';
import type { Router } from 'express';

// Type for Express Router stack layer
type RouterLayer = any;

// Mock multer
vi.mock('multer', () => {
  const mockMulter = () => ({
    single: () => (_req: any, _res: any, next: any) => next(),
  });
  mockMulter.memoryStorage = () => ({});
  return { default: mockMulter };
});

// Mock services
const mockParseFile = vi.fn();
const mockImport = vi.fn();
const mockClientValidateAndPreview = vi.fn();
const mockClientCommitTransaction = vi.fn();
const mockCaregiverValidateAndPreview = vi.fn();
const mockCaregiverCommitTransaction = vi.fn();

vi.mock('@folkcare/client-demographics', () => ({
  ClientImportService: vi.fn().mockImplementation(function () {
    return {
      parseFile: mockParseFile,
      import: mockImport,
      validateAndPreview: mockClientValidateAndPreview,
      commitTransaction: mockClientCommitTransaction,
    };
  }),
}));

vi.mock('@folkcare/caregiver-staff', () => ({
  CaregiverImportService: vi.fn().mockImplementation(function () {
    return {
      validateAndPreview: mockCaregiverValidateAndPreview,
      commitTransaction: mockCaregiverCommitTransaction,
    };
  }),
}));

// Mock core module
vi.mock('@folkcare/core', async () => {
  const actual = await vi.importActual('@folkcare/core');
  return {
    ...actual,
    asyncHandler: (fn: any) => fn,
    AuthMiddleware: vi.fn().mockImplementation(function () {
      return {
        requireAuth: (_req: any, _res: any, next: any) => {
          _req.user = {
            userId: '123e4567-e89b-12d3-a456-426614174000',
            organizationId: '223e4567-e89b-12d3-a456-426614174000',
            roles: ['ADMIN'],
            permissions: ['import:clients'],
            branchIds: ['branch-1'],
          };
          next();
        },
      };
    }),
  };
});

// Import after mocking
import { createImportRoutes } from '../import-routes.js';

// Helper to call Express route handlers
async function callHandler(handler: any, req: any, res: any): Promise<void> {
  const next = vi.fn();
  await handler(req, res, next);
}

describe('Import Routes', () => {
  let mockDb: Database;
  let router: Router;

  beforeEach(() => {
    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      getPool: vi.fn().mockReturnValue({}),
    } as unknown as Database;

    router = createImportRoutes(mockDb);

    // Reset mocks
    mockParseFile.mockReset();
    mockImport.mockReset();
    mockClientValidateAndPreview.mockReset();
    mockClientCommitTransaction.mockReset();
    mockCaregiverValidateAndPreview.mockReset();
    mockCaregiverCommitTransaction.mockReset();
  });

  describe('Router Configuration', () => {
    it('should create router with expected routes', () => {
      expect(router).toBeDefined();

      const routes = (router.stack as RouterLayer[])
        .filter((layer: RouterLayer) => layer.route)
        .map((layer: RouterLayer) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      expect(routes.length).toBeGreaterThan(0);
    });

    it('should have POST /clients endpoint', () => {
      const routes = (router.stack as RouterLayer[])
        .filter((layer: RouterLayer) => layer.route)
        .map((layer: RouterLayer) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      const importRoute = routes.find(
        (r: any) => r.path === '/clients' && r.methods.includes('post')
      );
      expect(importRoute).toBeDefined();
    });

    it('should have GET /clients/template endpoint', () => {
      const routes = (router.stack as RouterLayer[])
        .filter((layer: RouterLayer) => layer.route)
        .map((layer: RouterLayer) => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      const templateRoute = routes.find(
        (r: any) => r.path === '/clients/template' && r.methods.includes('get')
      );
      expect(templateRoute).toBeDefined();
    });
  });

  describe('POST /clients', () => {
    function getImportHandler() {
      const route = (router.stack as RouterLayer[]).find(
        (layer: RouterLayer) => layer.route?.path === '/clients'
      )!;
      // Get the last handler in the stack (after middleware)
      return route.route.stack[route.route.stack.length - 1].handle;
    }

    it('should return 400 when no file is uploaded', async () => {
      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          organizationId: '223e4567-e89b-12d3-a456-426614174000',
          roles: ['ADMIN'],
          permissions: ['import:clients'],
          branchIds: ['branch-1'],
        },
        file: undefined,
        body: {},
      } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await callHandler(getImportHandler(), req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'No file uploaded' });
    });

    it('should import clients from CSV file', async () => {
      mockParseFile.mockResolvedValue({
        records: [{ first_name: 'John', last_name: 'Doe' }],
        errors: [],
      });
      mockImport.mockResolvedValue({
        success: true,
        imported: 1,
        skipped: 0,
        errors: [],
        metadata: {},
      });

      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          organizationId: '223e4567-e89b-12d3-a456-426614174000',
          roles: ['ADMIN'],
          permissions: ['import:clients'],
          branchIds: ['branch-1'],
        },
        file: {
          buffer: Buffer.from('first_name,last_name\nJohn,Doe'),
          originalname: 'clients.csv',
          size: 100,
          mimetype: 'text/csv',
        },
        body: { dryRun: 'false', updateExisting: 'false' },
      } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await callHandler(getImportHandler(), req, res);

      expect(mockParseFile).toHaveBeenCalled();
      expect(mockImport).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
    });

    it('should support dry run mode', async () => {
      mockParseFile.mockResolvedValue({
        records: [{ first_name: 'John', last_name: 'Doe' }],
        errors: [],
      });
      mockImport.mockResolvedValue({
        success: true,
        imported: 0,
        wouldImport: 1,
        metadata: {},
      });

      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          organizationId: '223e4567-e89b-12d3-a456-426614174000',
          roles: ['ADMIN'],
          permissions: ['import:clients'],
          branchIds: ['branch-1'],
        },
        file: {
          buffer: Buffer.from('first_name,last_name\nJohn,Doe'),
          originalname: 'clients.csv',
          size: 100,
          mimetype: 'text/csv',
        },
        body: { dryRun: 'true', updateExisting: 'false' },
      } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await callHandler(getImportHandler(), req, res);

      expect(mockImport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ dryRun: true })
      );
    });

    it('should support update existing mode', async () => {
      mockParseFile.mockResolvedValue({
        records: [{ first_name: 'John', last_name: 'Doe' }],
        errors: [],
      });
      mockImport.mockResolvedValue({
        success: true,
        imported: 1,
        updated: 0,
        metadata: {},
      });

      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          organizationId: '223e4567-e89b-12d3-a456-426614174000',
          roles: ['ADMIN'],
          permissions: ['import:clients'],
          branchIds: ['branch-1'],
        },
        file: {
          buffer: Buffer.from('first_name,last_name\nJohn,Doe'),
          originalname: 'clients.csv',
          size: 100,
          mimetype: 'text/csv',
        },
        body: { dryRun: 'false', updateExisting: 'true' },
      } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await callHandler(getImportHandler(), req, res);

      expect(mockImport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ updateExisting: true })
      );
    });

    it('should return 400 when parsing fails with errors', async () => {
      mockParseFile.mockResolvedValue({
        records: [],
        errors: [{ row: 1, field: 'first_name', message: 'Required field', severity: 'ERROR' }],
      });

      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          organizationId: '223e4567-e89b-12d3-a456-426614174000',
          roles: ['ADMIN'],
          permissions: ['import:clients'],
          branchIds: ['branch-1'],
        },
        file: {
          buffer: Buffer.from('invalid,data'),
          originalname: 'clients.csv',
          size: 50,
          mimetype: 'text/csv',
        },
        body: {},
      } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await callHandler(getImportHandler(), req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'File parsing failed',
        errors: expect.any(Array),
      });
    });

    it('should include file metadata in result', async () => {
      mockParseFile.mockResolvedValue({
        records: [{ first_name: 'John', last_name: 'Doe' }],
        errors: [],
      });
      mockImport.mockResolvedValue({
        success: true,
        imported: 1,
        metadata: {},
      });

      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          organizationId: '223e4567-e89b-12d3-a456-426614174000',
          roles: ['ADMIN'],
          permissions: ['import:clients'],
          branchIds: ['branch-1'],
        },
        file: {
          buffer: Buffer.from('first_name,last_name\nJohn,Doe'),
          originalname: 'my_clients.csv',
          size: 256,
          mimetype: 'text/csv',
        },
        body: {},
      } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await callHandler(getImportHandler(), req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            sourceFile: {
              name: 'my_clients.csv',
              size: 256,
              mimeType: 'text/csv',
            },
          }),
        })
      );
    });

    it('should pass correct organization and user context', async () => {
      mockParseFile.mockResolvedValue({
        records: [{ first_name: 'Test', last_name: 'User' }],
        errors: [],
      });
      mockImport.mockResolvedValue({
        success: true,
        imported: 1,
        metadata: {},
      });

      const req = {
        user: {
          userId: 'user-abc',
          organizationId: 'org-xyz',
          roles: ['ADMIN'],
          permissions: ['import:clients'],
          branchIds: ['branch-1'],
        },
        file: {
          buffer: Buffer.from('data'),
          originalname: 'file.csv',
          size: 10,
          mimetype: 'text/csv',
        },
        body: {},
      } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await callHandler(getImportHandler(), req, res);

      expect(mockImport).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          organizationId: 'org-xyz',
          userId: 'user-abc',
        })
      );
    });
  });

  describe('GET /clients/template', () => {
    function getTemplateHandler() {
      const route = (router.stack as RouterLayer[]).find(
        (layer: RouterLayer) => layer.route?.path === '/clients/template'
      )!;
      return route.route.stack[route.route.stack.length - 1].handle;
    }

    it('should return CSV template', async () => {
      const req = {} as any;
      const res = {
        setHeader: vi.fn(),
        send: vi.fn(),
      } as any;

      await callHandler(getTemplateHandler(), req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=client_import_template.csv'
      );
      expect(res.send).toHaveBeenCalled();
    });

    it('should include expected columns in template', async () => {
      const req = {} as any;
      let sentData = '';
      const res = {
        setHeader: vi.fn(),
        send: vi.fn((data: string) => { sentData = data; }),
      } as any;

      await callHandler(getTemplateHandler(), req, res);

      // Check that template includes key columns
      expect(sentData).toContain('first_name');
      expect(sentData).toContain('last_name');
      expect(sentData).toContain('date_of_birth');
      expect(sentData).toContain('email');
      expect(sentData).toContain('phone_number');
      expect(sentData).toContain('address_line1');
    });

    it('should include sample data row', async () => {
      const req = {} as any;
      let sentData = '';
      const res = {
        setHeader: vi.fn(),
        send: vi.fn((data: string) => { sentData = data; }),
      } as any;

      await callHandler(getTemplateHandler(), req, res);

      // Template should have header row and sample row
      const lines = sentData.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
      
      // Sample row should contain example data
      expect(sentData).toContain('John');
      expect(sentData).toContain('Doe');
    });
  });

  describe('Middleware Configuration', () => {
    it('should have auth middleware on import endpoint', () => {
      const route = (router.stack as RouterLayer[]).find(
        (layer: RouterLayer) => layer.route?.path === '/clients'
      );

      // Should have multiple handlers (auth + multer + handler)
      expect(route).toBeDefined();
      expect(route?.route?.stack.length).toBeGreaterThan(1);
    });

    it('should not require auth for template endpoint', () => {
      const route = (router.stack as RouterLayer[]).find(
        (layer: RouterLayer) => layer.route?.path === '/clients/template'
      );

      // Template download doesn't need complex middleware
      expect(route).toBeDefined();
    });
  });

  describe('POST /clients/csv - Two-Phase Import', () => {
    function getClientsCsvHandler() {
      const route = (router.stack as RouterLayer[]).find(
        (layer: RouterLayer) => layer.route?.path === '/clients/csv'
      )!;
      return route.route.stack[route.route.stack.length - 1].handle;
    }

    it('Phase 1: should return validation preview with duplicate flags', async () => {
      mockClientValidateAndPreview.mockResolvedValue({
        totalRows: 2,
        validRows: 1,
        errorRows: 0,
        warningRows: 0,
        duplicateRows: 1,
        rows: [
          {
            rowNumber: 1,
            data: { client_number: 'C001', first_name: 'John', last_name: 'Doe' },
            isValid: true,
            errors: [],
            warnings: [],
            duplicateMatch: {
              matchedBy: 'id',
              existingRecordId: '111',
              details: 'Matches existing client C001',
            },
          },
          {
            rowNumber: 2,
            data: { client_number: 'C002', first_name: 'Jane', last_name: 'Smith' },
            isValid: true,
            errors: [],
            warnings: [],
          },
        ],
        headers: ['client_number', 'first_name', 'last_name'],
        suggestedMappings: [],
      });

      const csvContent = 'client_number,first_name,last_name\nC001,John,Doe\nC002,Jane,Smith';
      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          organizationId: '223e4567-e89b-12d3-a456-426614174000',
          roles: ['ADMIN'],
          permissions: ['import:clients'],
          branchIds: ['branch-1'],
        },
        body: {
          csvContent,
          previewOnly: true,
        },
      } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await callHandler(getClientsCsvHandler(), req, res);

      expect(mockClientValidateAndPreview).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          totalRows: 2,
          duplicateRows: 1,
        })
      );
    });

    it('Phase 2: should commit confirmed records in atomic transaction', async () => {
      mockClientCommitTransaction.mockResolvedValue({
        success: true,
        total: 1,
        imported: 1,
        updated: 0,
        skipped: 0,
        errors: [],
      });

      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          organizationId: '223e4567-e89b-12d3-a456-426614174000',
          roles: ['ADMIN'],
          permissions: ['import:clients'],
          branchIds: ['branch-1'],
        },
        body: {
          confirm: true,
          records: [{ client_number: 'C002', first_name: 'Jane', last_name: 'Smith' }],
        },
      } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await callHandler(getClientsCsvHandler(), req, res);

      expect(mockClientCommitTransaction).toHaveBeenCalledWith(
        [{ client_number: 'C002', first_name: 'Jane', last_name: 'Smith' }],
        expect.objectContaining({
          organizationId: '223e4567-e89b-12d3-a456-426614174000',
          userId: '123e4567-e89b-12d3-a456-426614174000',
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          imported: 1,
        })
      );
    });
  });

  describe('POST /caregivers/csv - Two-Phase Import', () => {
    function getCaregiversCsvHandler() {
      const route = (router.stack as RouterLayer[]).find(
        (layer: RouterLayer) => layer.route?.path === '/caregivers/csv'
      )!;
      return route.route.stack[route.route.stack.length - 1].handle;
    }

    it('Phase 1: should return validation preview for caregivers', async () => {
      mockCaregiverValidateAndPreview.mockResolvedValue({
        totalRows: 1,
        validRows: 1,
        errorRows: 0,
        warningRows: 0,
        duplicateRows: 0,
        rows: [
          {
            rowNumber: 1,
            data: { employee_number: 'E001', first_name: 'Maria', last_name: 'Garcia' },
            isValid: true,
            errors: [],
            warnings: [],
          },
        ],
        headers: ['employee_number', 'first_name', 'last_name'],
        suggestedMappings: [],
      });

      const csvContent = 'employee_number,first_name,last_name\nE001,Maria,Garcia';
      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          organizationId: '223e4567-e89b-12d3-a456-426614174000',
          roles: ['ADMIN'],
          permissions: ['import:caregivers'],
          branchIds: ['branch-1'],
        },
        body: {
          csvContent,
          previewOnly: true,
        },
      } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await callHandler(getCaregiversCsvHandler(), req, res);

      expect(mockCaregiverValidateAndPreview).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          validRows: 1,
        })
      );
    });

    it('Phase 2: should commit confirmed caregiver records in atomic transaction', async () => {
      mockCaregiverCommitTransaction.mockResolvedValue({
        success: true,
        total: 1,
        imported: 1,
        updated: 0,
        skipped: 0,
        errors: [],
      });

      const req = {
        user: {
          userId: '123e4567-e89b-12d3-a456-426614174000',
          organizationId: '223e4567-e89b-12d3-a456-426614174000',
          roles: ['ADMIN'],
          permissions: ['import:caregivers'],
          branchIds: ['branch-1'],
        },
        body: {
          confirm: true,
          records: [{ employee_number: 'E001', first_name: 'Maria', last_name: 'Garcia' }],
        },
      } as any;
      const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;

      await callHandler(getCaregiversCsvHandler(), req, res);

      expect(mockCaregiverCommitTransaction).toHaveBeenCalledWith(
        [{ employee_number: 'E001', first_name: 'Maria', last_name: 'Garcia' }],
        expect.objectContaining({
          organizationId: '223e4567-e89b-12d3-a456-426614174000',
          userId: '123e4567-e89b-12d3-a456-426614174000',
        })
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          imported: 1,
        })
      );
    });
  });
});
