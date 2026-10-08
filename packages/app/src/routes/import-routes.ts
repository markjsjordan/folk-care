/**
 * Import API routes
 *
 * Bulk data import endpoints with file upload support, two-phase import workflow,
 * legacy column mapping (HHAeXchange, ClearCare, Alora), and single-transaction commit.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  asyncHandler,
  Database,
  AuthMiddleware,
  UserContext,
  AuditService,
  processCsvInChunks,
  detectColumnMappings,
  applyColumnMapping,
} from '@folkcare/core';
import { ClientImportService, ClientImportRow } from '@folkcare/client-demographics';
import { CaregiverImportService, CaregiverImportRow } from '@folkcare/caregiver-staff';

export function createImportRoutes(db: Database): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware(db);
  const auditService = new AuditService(db);

  // Configure multer for file uploads with memory storage
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB max file size
    },
    fileFilter: (_req, file, cb) => {
      const allowedMimeTypes = [
        'text/csv',
        'text/plain',
        'application/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
      if (
        allowedMimeTypes.includes(file.mimetype) ||
        file.originalname.toLowerCase().endsWith('.csv')
      ) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only CSV files are allowed.'));
      }
    },
  });

  /**
   * Helper to parse mappings safely from request body
   */
  function parseMappings(rawMappings: unknown): Record<string, string> | undefined {
    if (!rawMappings) return undefined;
    if (typeof rawMappings === 'object') return rawMappings as Record<string, string>;
    if (typeof rawMappings === 'string') {
      try {
        return JSON.parse(rawMappings) as Record<string, string>;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Helper to parse records array from request body
   */
  function parseRecords<T>(rawRecords: unknown): T[] | undefined {
    if (!rawRecords) return undefined;
    if (Array.isArray(rawRecords)) return rawRecords as T[];
    if (typeof rawRecords === 'string') {
      try {
        const parsed = JSON.parse(rawRecords);
        return Array.isArray(parsed) ? (parsed as T[]) : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * POST /api/import/clients/csv
   * Two-phase bulk client CSV import
   */
  router.post(
    '/clients/csv',
    authMiddleware.requireAuth,
    upload.single('file'),
    asyncHandler(async (req: Request, res: Response) => {
      const user = req.user!;
      const context: UserContext = {
        userId: user.userId,
        organizationId: user.organizationId,
        roles: user.roles,
        permissions: user.permissions,
        branchIds: user.branchIds ?? [],
      };

      const file = req.file;
      const isCommitPhase =
        req.body.phase === 'commit' ||
        req.body.confirm === true ||
        req.body.confirm === 'true' ||
        (req.body.dryRun === false && !req.body.phase);
      const updateExisting =
        req.body.updateExisting === true || req.body.updateExisting === 'true';
      const userMappings = parseMappings(req.body.mappings);
      const bodyRecords = parseRecords<ClientImportRow>(req.body.records);

      const importService = new ClientImportService(db);

      // Phase 2 with confirmed records from body
      if (isCommitPhase && bodyRecords && bodyRecords.length > 0) {
        const commitResult = await importService.commitTransaction(
          bodyRecords,
          {
            organizationId: context.organizationId!,
            userId: context.userId,
            updateExisting,
          }
        );

        // Audit logging for HIPAA Security Rule compliance
        await auditService.logEvent(context, {
          eventType: 'DATA_MODIFICATION',
          resource: 'clients',
          resourceId: context.organizationId!,
          action: 'BULK_CSV_IMPORT_COMMIT',
          result: 'SUCCESS',
          metadata: {
            imported: commitResult.imported,
            updated: commitResult.updated,
            skipped: commitResult.skipped,
            total: commitResult.total,
            ipAddress: req.ip,
          },
          ipAddress: req.ip,
        });

        res.json(commitResult);
        return;
      }

      const fileBuffer =
        req.file?.buffer ??
        (typeof req.body.csvContent === 'string' && req.body.csvContent.trim().length > 0
          ? Buffer.from(req.body.csvContent, 'utf-8')
          : undefined);

      // If no file and no records, error
      if (!fileBuffer && (!bodyRecords || bodyRecords.length === 0)) {
        res.status(400).json({ error: 'No file uploaded or records provided' });
        return;
      }

      // Stream/chunk process the CSV buffer to avoid memory exhaustion
      let parsedRawRecords: Record<string, unknown>[] = [];
      let detectedHeaders: string[] = [];

      if (fileBuffer) {
        const streamResult = await processCsvInChunks<Record<string, unknown>>(fileBuffer, {
          chunkSize: 250,
          onChunk: (chunk) => {
            parsedRawRecords.push(...chunk);
          },
        });
        detectedHeaders = streamResult.headers;

        if (streamResult.errors.length > 0) {
          res.status(400).json({
            success: false,
            error: 'CSV parsing error',
            errors: streamResult.errors,
          });
          return;
        }
      } else if (bodyRecords) {
        parsedRawRecords = bodyRecords as unknown as Record<string, unknown>[];
        detectedHeaders = Object.keys(parsedRawRecords[0] ?? {});
      }

      // Detect or apply column mapping
      const autoMappings = detectColumnMappings(detectedHeaders, 'clients');
      const activeMappings = userMappings ? { ...autoMappings, ...userMappings } : autoMappings;

      // Apply mapping to records
      const mappedRecords: ClientImportRow[] = parsedRawRecords.map((row) => {
        const mapped = applyColumnMapping(row, activeMappings) as unknown as ClientImportRow;
        if (!mapped.branch_id && req.body.branchId) {
          mapped.branch_id = req.body.branchId;
        }
        return mapped;
      });

      // Phase 2: Commit in single transaction directly from file
      if (isCommitPhase) {
        const commitResult = await importService.commitTransaction(
          mappedRecords,
          {
            organizationId: context.organizationId!,
            userId: context.userId,
            updateExisting,
          }
        );

        await auditService.logEvent(context, {
          eventType: 'DATA_MODIFICATION',
          resource: 'clients',
          resourceId: context.organizationId!,
          action: 'BULK_CSV_IMPORT_COMMIT',
          result: 'SUCCESS',
          metadata: {
            imported: commitResult.imported,
            updated: commitResult.updated,
            skipped: commitResult.skipped,
            total: commitResult.total,
            fileName: file?.originalname,
            ipAddress: req.ip,
          },
          ipAddress: req.ip,
        });

        res.json(commitResult);
        return;
      }

      // Phase 1: Validate, detect duplicates, return preview with highlights
      const previewResult = await importService.validateAndPreview(
        mappedRecords,
        {
          organizationId: context.organizationId!,
          userId: context.userId,
          updateExisting,
        },
        detectedHeaders,
        activeMappings
      );

      res.json({
        success: true,
        ...previewResult,
      });
    })
  );

  /**
   * POST /api/import/caregivers/csv
   * Two-phase bulk caregiver CSV import
   */
  router.post(
    '/caregivers/csv',
    authMiddleware.requireAuth,
    upload.single('file'),
    asyncHandler(async (req: Request, res: Response) => {
      const user = req.user!;
      const context: UserContext = {
        userId: user.userId,
        organizationId: user.organizationId,
        roles: user.roles,
        permissions: user.permissions,
        branchIds: user.branchIds ?? [],
      };

      const file = req.file;
      const isCommitPhase =
        req.body.phase === 'commit' ||
        req.body.confirm === true ||
        req.body.confirm === 'true' ||
        (req.body.dryRun === false && !req.body.phase);
      const updateExisting =
        req.body.updateExisting === true || req.body.updateExisting === 'true';
      const userMappings = parseMappings(req.body.mappings);
      const bodyRecords = parseRecords<CaregiverImportRow>(req.body.records);

      const importService = new CaregiverImportService(db);

      // Phase 2 with confirmed records from body
      if (isCommitPhase && bodyRecords && bodyRecords.length > 0) {
        const commitResult = await importService.commitTransaction(
          bodyRecords,
          {
            organizationId: context.organizationId!,
            userId: context.userId,
            updateExisting,
          }
        );

        await auditService.logEvent(context, {
          eventType: 'DATA_MODIFICATION',
          resource: 'caregivers',
          resourceId: context.organizationId!,
          action: 'BULK_CSV_IMPORT_COMMIT',
          result: 'SUCCESS',
          metadata: {
            imported: commitResult.imported,
            updated: commitResult.updated,
            skipped: commitResult.skipped,
            total: commitResult.total,
            ipAddress: req.ip,
          },
          ipAddress: req.ip,
        });

        res.json(commitResult);
        return;
      }

      const fileBuffer =
        req.file?.buffer ??
        (typeof req.body.csvContent === 'string' && req.body.csvContent.trim().length > 0
          ? Buffer.from(req.body.csvContent, 'utf-8')
          : undefined);

      // If no file and no records, error
      if (!fileBuffer && (!bodyRecords || bodyRecords.length === 0)) {
        res.status(400).json({ error: 'No file uploaded or records provided' });
        return;
      }

      // Stream/chunk process the CSV buffer to avoid memory exhaustion
      let parsedRawRecords: Record<string, unknown>[] = [];
      let detectedHeaders: string[] = [];

      if (fileBuffer) {
        const streamResult = await processCsvInChunks<Record<string, unknown>>(fileBuffer, {
          chunkSize: 250,
          onChunk: (chunk) => {
            parsedRawRecords.push(...chunk);
          },
        });
        detectedHeaders = streamResult.headers;

        if (streamResult.errors.length > 0) {
          res.status(400).json({
            success: false,
            error: 'CSV parsing error',
            errors: streamResult.errors,
          });
          return;
        }
      } else if (bodyRecords) {
        parsedRawRecords = bodyRecords as unknown as Record<string, unknown>[];
        detectedHeaders = Object.keys(parsedRawRecords[0] ?? {});
      }

      // Detect or apply column mapping
      const autoMappings = detectColumnMappings(detectedHeaders, 'caregivers');
      const activeMappings = userMappings ? { ...autoMappings, ...userMappings } : autoMappings;

      // Apply mapping to records
      const mappedRecords: CaregiverImportRow[] = parsedRawRecords.map((row) => {
        const mapped = applyColumnMapping(row, activeMappings) as unknown as CaregiverImportRow;
        if (!mapped.primary_branch_id && req.body.branchId) {
          mapped.primary_branch_id = req.body.branchId;
        }
        return mapped;
      });

      // Phase 2: Commit in single transaction directly from file
      if (isCommitPhase) {
        const commitResult = await importService.commitTransaction(
          mappedRecords,
          {
            organizationId: context.organizationId!,
            userId: context.userId,
            updateExisting,
          }
        );

        await auditService.logEvent(context, {
          eventType: 'DATA_MODIFICATION',
          resource: 'caregivers',
          resourceId: context.organizationId!,
          action: 'BULK_CSV_IMPORT_COMMIT',
          result: 'SUCCESS',
          metadata: {
            imported: commitResult.imported,
            updated: commitResult.updated,
            skipped: commitResult.skipped,
            total: commitResult.total,
            fileName: file?.originalname,
            ipAddress: req.ip,
          },
          ipAddress: req.ip,
        });

        res.json(commitResult);
        return;
      }

      // Phase 1: Validate, detect duplicates, return preview with highlights
      const previewResult = await importService.validateAndPreview(
        mappedRecords,
        {
          organizationId: context.organizationId!,
          userId: context.userId,
          updateExisting,
        },
        detectedHeaders,
        activeMappings
      );

      res.json({
        success: true,
        ...previewResult,
      });
    })
  );

  /**
   * Backwards-compatible POST /api/import/clients
   */
  router.post(
    '/clients',
    authMiddleware.requireAuth,
    upload.single('file'),
    asyncHandler(async (req: Request, res: Response) => {
      const file = req.file;
      if (file === undefined) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const user = req.user!;
      const context: UserContext = {
        userId: user.userId,
        organizationId: user.organizationId,
        roles: user.roles,
        permissions: user.permissions,
        branchIds: user.branchIds ?? [],
      };

      const dryRun = req.body.dryRun === 'true' || req.body.dryRun === true;
      const updateExisting = req.body.updateExisting === 'true' || req.body.updateExisting === true;

      const importService = new ClientImportService(db);
      const parseResult = await importService.parseFile(file.buffer, file.originalname);

      const hasErrors: boolean = parseResult.errors.some((e) => e.severity === 'ERROR');
      if (parseResult.errors.length > 0 && hasErrors === true) {
        res.status(400).json({
          success: false,
          error: 'File parsing failed',
          errors: parseResult.errors,
        });
        return;
      }

      const importResult = await importService.import(parseResult.records, {
        organizationId: context.organizationId!,
        userId: context.userId,
        dryRun,
        updateExisting,
        batchSize: 100,
      });

      importResult.metadata.sourceFile = {
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
      };

      res.json(importResult);
    })
  );

  /**
   * GET /api/import/clients/template
   * Download CSV template for client import
   */
  router.get(
    '/clients/template',
    asyncHandler(async (_req: Request, res: Response) => {
      const template = [
        'client_number,first_name,last_name,date_of_birth,branch_id,address_line1,address_line2,address_city,address_state,address_postal_code,phone_number,email,gender,status,referral_source,intake_date,emergency_contact_name,emergency_contact_phone,emergency_contact_relationship',
        'C001,John,Doe,1950-01-15,00000000-0000-0000-0000-000000000000,123 Main St,Apt 4B,Austin,TX,78701,512-555-1234,john.doe@example.com,MALE,ACTIVE,Hospital Discharge,2024-01-15,Jane Doe,512-555-5678,Daughter',
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=client_import_template.csv');
      res.send(template);
    })
  );

  /**
   * GET /api/import/caregivers/template
   * Download CSV template for caregiver import
   */
  router.get(
    '/caregivers/template',
    asyncHandler(async (_req: Request, res: Response) => {
      const template = [
        'employee_number,first_name,last_name,date_of_birth,primary_branch_id,address_line1,address_line2,address_city,address_state,address_postal_code,hire_date,employment_type,role,employment_status,email,phone_number,pay_rate_amount,skills,specializations,emergency_contact_name,emergency_contact_phone',
        'E001,Maria,Garcia,1985-05-12,00000000-0000-0000-0000-000000000000,100 Main St,Suite 200,Austin,TX,78701,2023-01-15,FULL_TIME,CAREGIVER,ACTIVE,maria.garcia@folkcare.example,512-555-7777,18.50,CPR|Patient Mobility,CNA|First Aid,Carlos Garcia,512-555-7778',
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=caregiver_import_template.csv');
      res.send(template);
    })
  );

  return router;
}
