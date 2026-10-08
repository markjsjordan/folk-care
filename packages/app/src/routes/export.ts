/**
 * Data Export routes
 *
 * Provides API endpoints for one-click full data export
 * including FHIR R4 format for healthcare interoperability.
 */

import { Router, type Router as RouterType, type Request, type Response, type NextFunction } from 'express';
// @ts-expect-error archiver CJS default export
import archiver from 'archiver';
import Papa from 'papaparse';
import {
  DataExportService,
  FHIRExportService,
  HL7ExportService,
  AuthMiddleware,
  AuditService,
  getDatabase,
  type UserContext,
} from '@folkcare/core';
import { asyncHandler } from '@folkcare/core';
import { z } from 'zod';
import type { UUID } from '@folkcare/core';

const router: RouterType = Router();

// Lazily construct AuthMiddleware on first request so this module can be
// imported (and the router mounted) before initializeDatabase() runs in
// server.ts's startup sequence.
let authMiddleware: AuthMiddleware | undefined;
function getAuthMiddleware(): AuthMiddleware {
  if (authMiddleware === undefined) {
    authMiddleware = new AuthMiddleware(getDatabase());
  }
  return authMiddleware;
}

// Apply authentication to all export routes
// SECURITY: Must be the real JWT-verifying AuthMiddleware.requireAuth, not
// the mock requireAuth (which trusted spoofable X-User-* headers with zero
// JWT cross-check and was the root cause of a confirmed live exploit).
router.use((req: Request, res: Response, next: NextFunction) => {
  getAuthMiddleware().requireAuth(req, res, next).catch(next);
});

// Validation schema for export request
const exportRequestSchema = z.object({
  format: z.enum(['json', 'csv']),
  includeDeleted: z.boolean().optional().default(false),
  tables: z.array(z.string()).optional(),
});

// Validation schema for audit log export
const auditLogExportSchema = z.object({
  format: z.enum(['json', 'csv']),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  userId: z.string().uuid().optional(),
  eventType: z.string().optional(),
  resource: z.string().optional(),
  action: z.string().optional(),
  includeRevisions: z.boolean().optional().default(true),
  includeSecurityEvents: z.boolean().optional().default(true),
});

/**
 * Get export metadata (preview before download)
 *
 * @route GET /export/metadata
 * @security Requires authentication and organization scope
 */
router.get('/metadata', asyncHandler(async (req: Request, res: Response) => {
  // Get organization ID from authenticated user
  const organizationId = req.user?.organizationId;

  if (organizationId === undefined) {
    res.status(400).json({ error: 'Organization ID required' });
    return;
  }

  const exportService = new DataExportService();
  const metadata = await exportService.getExportMetadata(organizationId);

  res.json({
    organizationId,
    ...metadata,
    estimatedSizeMB: (metadata.estimatedSize / (1024 * 1024)).toFixed(2),
  });
}));

/**
 * Export organization data
 *
 * @route POST /export
 * @security Requires authentication and organization scope
 * @body {format: 'json' | 'csv', includeDeleted?: boolean, tables?: string[]}
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  // Get organization ID from authenticated user
  const organizationId = req.user?.organizationId;

  if (organizationId === undefined) {
    res.status(400).json({ error: 'Organization ID required' });
    return;
  }

  // Validate request body
  const validatedBody = exportRequestSchema.parse(req.body);

  const exportService = new DataExportService();
  const result = await exportService.exportData({
    organizationId,
    ...validatedBody,
  });

  // Set appropriate content type and filename
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const filename = `folkcare-export-${organizationId.slice(0, 8)}-${timestamp}.${validatedBody.format}`;

  if (validatedBody.format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(result.data);
  } else {
    // CSV format
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(result.data);
  }
}));

/**
 * Export audit logs
 *
 * @route POST /export/audit-logs
 * @security Requires authentication and admin privileges
 * @body {format, startDate?, endDate?, userId?, eventType?, resource?, action?, includeRevisions?, includeSecurityEvents?}
 */
router.post('/audit-logs', asyncHandler(async (req: Request, res: Response) => {
  // Get organization ID from authenticated user
  const organizationId = req.user?.organizationId;

  if (organizationId === undefined) {
    res.status(400).json({ error: 'Organization ID required' });
    return;
  }

  // Validate request body
  const validatedBody = auditLogExportSchema.parse(req.body);

  const exportService = new DataExportService();
  const result = await exportService.exportAuditLogs({
    organizationId,
    ...validatedBody,
  });

  // Set appropriate content type and filename
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const filename = `folkcare-audit-logs-${organizationId.slice(0, 8)}-${timestamp}.${validatedBody.format}`;

  if (validatedBody.format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(result.data);
  } else {
    // CSV format
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(result.data);
  }
}));

// ============================================================================
// FHIR R4 Export Routes
// ============================================================================

// Validation schema for FHIR batch export
const fhirBatchExportSchema = z.object({
  clientIds: z.array(z.string().uuid()).min(1).max(100),
  includeOrganization: z.boolean().optional().default(true),
});

/**
 * Export single patient as FHIR R4 Bundle
 *
 * @route GET /export/fhir/patient/:clientId
 * @security Requires authentication and organization scope
 */
router.get('/fhir/patient/:clientId', asyncHandler(async (req: Request, res: Response) => {
  const organizationId = req.user?.organizationId;

  if (organizationId === undefined) {
    res.status(400).json({ error: 'Organization ID required' });
    return;
  }

  const clientId = req.params.clientId;
  if (clientId === undefined || clientId === '' || !z.string().uuid().safeParse(clientId).success) {
    res.status(400).json({ error: 'Valid client ID required' });
    return;
  }

  const includeOrganization = req.query.includeOrganization !== 'false';

  const fhirService = new FHIRExportService();
  const bundle = await fhirService.exportPatientBundle(
    clientId as UUID,
    organizationId,
    { includeOrganization }
  );

  // Set FHIR-specific headers
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const filename = `fhir-patient-${clientId.slice(0, 8)}-${timestamp}.json`;

  res.setHeader('Content-Type', 'application/fhir+json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.json(bundle);
}));

/**
 * Export multiple patients as FHIR R4 searchset Bundle
 *
 * @route POST /export/fhir/patients
 * @security Requires authentication and organization scope
 * @body {clientIds: string[], includeOrganization?: boolean}
 */
router.post('/fhir/patients', asyncHandler(async (req: Request, res: Response) => {
  const organizationId = req.user?.organizationId;

  if (organizationId === undefined) {
    res.status(400).json({ error: 'Organization ID required' });
    return;
  }

  // Validate request body
  const validatedBody = fhirBatchExportSchema.parse(req.body);

  const fhirService = new FHIRExportService();
  const bundle = await fhirService.exportPatientSearchSet(
    validatedBody.clientIds as UUID[],
    organizationId,
    { includeOrganization: validatedBody.includeOrganization }
  );

  // Set FHIR-specific headers
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const filename = `fhir-patients-${organizationId.slice(0, 8)}-${timestamp}.json`;

  res.setHeader('Content-Type', 'application/fhir+json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.json(bundle);
}));

/**
 * Get FHIR export metadata (available patients and estimated size)
 *
 * @route GET /export/fhir/metadata
 * @security Requires authentication and organization scope
 */
router.get('/fhir/metadata', asyncHandler(async (req: Request, res: Response) => {
  const organizationId = req.user?.organizationId;

  if (organizationId === undefined) {
    res.status(400).json({ error: 'Organization ID required' });
    return;
  }

  const fhirService = new FHIRExportService();
  const metadata = await fhirService.getExportMetadata(organizationId);

  res.json({
    organizationId,
    format: 'FHIR R4',
    contentType: 'application/fhir+json',
    ...metadata,
  });
}));

// ============================================================================
// HL7 v2.x Export Routes
// ============================================================================

// Validation schema for HL7 export options
const hl7ExportOptionsSchema = z.object({
  messageType: z.enum(['ADT', 'ORU', 'ORM', 'DFT', 'MDM']).optional(),
  eventType: z.enum(['A01', 'A02', 'A03', 'A04', 'A08', 'A28', 'A31']).optional(),
  sendingApplication: z.string().optional(),
  sendingFacility: z.string().optional(),
  receivingApplication: z.string().optional(),
  receivingFacility: z.string().optional(),
  includeAllergies: z.boolean().optional().default(true),
  includeInsurance: z.boolean().optional().default(true),
  includeNextOfKin: z.boolean().optional().default(true),
});

// Validation schema for HL7 batch export
const hl7BatchExportSchema = z.object({
  clientIds: z.array(z.string().uuid()).min(1).max(100),
  options: hl7ExportOptionsSchema.optional(),
});

/**
 * Export single patient as HL7 v2.x ADT message
 *
 * @route GET /export/hl7/patient/:clientId
 * @security Requires authentication and organization scope
 */
router.get('/hl7/patient/:clientId', asyncHandler(async (req: Request, res: Response) => {
  const organizationId = req.user?.organizationId;

  if (organizationId === undefined) {
    res.status(400).json({ error: 'Organization ID required' });
    return;
  }

  const clientId = req.params.clientId;
  if (clientId === undefined || clientId === '' || !z.string().uuid().safeParse(clientId).success) {
    res.status(400).json({ error: 'Valid client ID required' });
    return;
  }

  // Parse query parameters for options
  const options = {
    includeAllergies: req.query.includeAllergies !== 'false',
    includeInsurance: req.query.includeInsurance !== 'false',
    includeNextOfKin: req.query.includeNextOfKin !== 'false',
  };

  const hl7Service = new HL7ExportService();
  const result = await hl7Service.exportPatientMessage(
    clientId as UUID,
    organizationId,
    options
  );

  // Set HL7-specific headers
  const filename = `hl7-patient-${clientId.slice(0, 8)}-${result.timestamp.replace(/[.:]/g, '-')}.hl7`;

  res.setHeader('Content-Type', 'application/hl7-v2');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(result.rawMessage);
}));

/**
 * Export multiple patients as HL7 v2.x ADT messages
 *
 * @route POST /export/hl7/patients
 * @security Requires authentication and organization scope
 * @body {clientIds: string[], options?: HL7ExportOptions}
 */
router.post('/hl7/patients', asyncHandler(async (req: Request, res: Response) => {
  const organizationId = req.user?.organizationId;

  if (organizationId === undefined) {
    res.status(400).json({ error: 'Organization ID required' });
    return;
  }

  // Validate request body
  const validatedBody = hl7BatchExportSchema.parse(req.body);

  const hl7Service = new HL7ExportService();
  const results = await hl7Service.exportPatientBatch(
    validatedBody.clientIds as UUID[],
    organizationId,
    validatedBody.options
  );

  // Set HL7-specific headers
  const timestamp = new Date().toISOString().replace(/[.:]/g, '-');
  const filename = `hl7-patients-${organizationId.slice(0, 8)}-${timestamp}.hl7`;

  res.setHeader('Content-Type', 'application/hl7-v2');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Concatenate all messages with blank line separator (HL7 batch format)
  const batchMessage = results.map(r => r.rawMessage).join('\r\n\r\n');
  res.send(batchMessage);
}));

/**
 * Get HL7 export metadata (available patients and estimated size)
 *
 * @route GET /export/hl7/metadata
 * @security Requires authentication and organization scope
 */
router.get('/hl7/metadata', asyncHandler(async (req: Request, res: Response) => {
  const organizationId = req.user?.organizationId;

  if (organizationId === undefined) {
    res.status(400).json({ error: 'Organization ID required' });
    return;
  }

  const hl7Service = new HL7ExportService();
  const metadata = await hl7Service.getExportMetadata(organizationId);

  res.json({
    organizationId,
    format: 'HL7 v2.x',
    contentType: 'application/hl7-v2',
    ...metadata,
  });
}));

// ============================================================================
// Regulatory Audit Pack Export Route
// ============================================================================

const auditPackSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  branchId: z.string().uuid().optional(),
  format: z.enum(['csv', 'json']).optional().default('csv'),
});

/**
 * Generate Regulatory Audit Pack (ZIP Archive)
 *
 * @route POST /export/audit-pack
 * @security Requires authentication and organization scope
 * @body {startDate?: string, endDate?: string, from_date?: string, to_date?: string, format?: 'csv' | 'json'}
 *
 * Generates an audit-ready zip archive containing:
 * - clients.csv: Client records & demographics
 * - evv_logs.csv: Electronic Visit Verification logs (clock in/out, GPS, verification level)
 * - caregiver_credentials.csv: Caregiver credentials, background checks & compliance
 * - visit_notes.csv: Visit and clinical documentation for specified date range
 * - manifest.json: HIPAA audit control verification manifest
 *
 * Implements HIPAA Security Rule 45 CFR § 164.312(b) audit trail logging.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, sonarjs/cognitive-complexity, sonarjs/no-nested-conditional */
router.post('/audit-pack', asyncHandler(async (req: Request, res: Response) => {
  const organizationId = req.user?.organizationId;

  if (organizationId === undefined) {
    res.status(400).json({ error: 'Organization ID required' });
    return;
  }

  const validated = auditPackSchema.parse(req.body ?? {});
  const startDate = validated.startDate ?? validated.from_date;
  const endDate = validated.endDate ?? validated.to_date;
  const db = getDatabase();

  // 1. Fetch Client records
  const clientsQuery = `
    SELECT 
      id, client_number, first_name, last_name, date_of_birth, gender,
      primary_phone, email, primary_address, status, intake_date, created_at
    FROM clients
    WHERE organization_id = $1 AND deleted_at IS NULL
    ORDER BY last_name, first_name
  `;
  const clientsRes = await db.query(clientsQuery, [organizationId]);
  const clientRows = clientsRes.rows.map((r: Record<string, any>) => ({
    id: r.id,
    client_number: r.client_number || '',
    first_name: r.first_name || '',
    last_name: r.last_name || '',
    date_of_birth: r.date_of_birth instanceof Date ? r.date_of_birth.toISOString().split('T')[0] : (r.date_of_birth || ''),
    gender: r.gender || '',
    phone: typeof r.primary_phone === 'object' && r.primary_phone !== null ? (r.primary_phone.number || JSON.stringify(r.primary_phone)) : (r.primary_phone || ''),
    email: r.email || '',
    street: typeof r.primary_address === 'object' && r.primary_address !== null ? (r.primary_address.street1 || r.primary_address.street || '') : '',
    city: typeof r.primary_address === 'object' && r.primary_address !== null ? (r.primary_address.city || '') : '',
    state: typeof r.primary_address === 'object' && r.primary_address !== null ? (r.primary_address.state || '') : '',
    zip: typeof r.primary_address === 'object' && r.primary_address !== null ? (r.primary_address.zipCode || r.primary_address.zip || '') : '',
    status: r.status || '',
    intake_date: r.intake_date || '',
    created_at: r.created_at || '',
  }));

  // 2. Fetch EVV Logs
  const evvParams: unknown[] = [organizationId];
  const evvConditions = ['organization_id = $1'];
  if (startDate) {
    evvParams.push(startDate);
    evvConditions.push(`(service_date >= $${evvParams.length} OR clock_in_time >= $${evvParams.length})`);
  }
  if (endDate) {
    evvParams.push(endDate);
    evvConditions.push(`(service_date <= $${evvParams.length} OR clock_in_time <= $${evvParams.length})`);
  }
  const evvQuery = `
    SELECT 
      id, visit_id, client_id, caregiver_id, client_name, caregiver_name,
      service_type_name, service_date, clock_in_time, clock_out_time,
      total_duration, verification_level, record_status, exception_events,
      clock_in_verification, clock_out_verification, integrity_hash, recorded_at
    FROM evv_records
    WHERE ${evvConditions.join(' AND ')}
    ORDER BY clock_in_time DESC
  `;
  const evvRes = await db.query(evvQuery, evvParams).catch(() => ({ rows: [] }));
  const evvRows = evvRes.rows.map((r: Record<string, any>) => ({
    id: r.id,
    visit_id: r.visit_id || '',
    client_id: r.client_id || '',
    client_name: r.client_name || '',
    caregiver_id: r.caregiver_id || '',
    caregiver_name: r.caregiver_name || '',
    service_type: r.service_type_name || '',
    service_date: r.service_date || '',
    clock_in_time: r.clock_in_time || '',
    clock_out_time: r.clock_out_time || '',
    duration_minutes: r.total_duration ?? '',
    verification_level: r.verification_level || '',
    record_status: r.record_status || '',
    clock_in_lat: r.clock_in_verification?.latitude ?? r.clock_in_verification?.lat ?? '',
    clock_in_lng: r.clock_in_verification?.longitude ?? r.clock_in_verification?.lng ?? '',
    clock_out_lat: r.clock_out_verification?.latitude ?? r.clock_out_verification?.lat ?? '',
    clock_out_lng: r.clock_out_verification?.longitude ?? r.clock_out_verification?.lng ?? '',
    exceptions: r.exception_events ? JSON.stringify(r.exception_events) : '',
    integrity_hash: r.integrity_hash || '',
    recorded_at: r.recorded_at || '',
  }));

  // 3. Fetch Caregiver Credentials
  const caregiversQuery = `
    SELECT 
      id, employee_number, first_name, last_name, role, employment_type,
      employment_status, hire_date, compliance_status, credentials,
      background_check, drug_screening, specializations
    FROM caregivers
    WHERE organization_id = $1 AND deleted_at IS NULL
    ORDER BY last_name, first_name
  `;
  const caregiversRes = await db.query(caregiversQuery, [organizationId]).catch(() => ({ rows: [] }));
  const credentialRows: Record<string, unknown>[] = [];
  for (const c of caregiversRes.rows as Record<string, any>[]) {
    const credentialsList = Array.isArray(c.credentials) ? c.credentials : (c.credentials ? [c.credentials] : []);
    if (credentialsList.length > 0) {
      for (const cred of credentialsList) {
        credentialRows.push({
          caregiver_id: c.id,
          employee_number: c.employee_number || '',
          caregiver_name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
          role: c.role || '',
          employment_status: c.employment_status || '',
          compliance_status: c.compliance_status || '',
          credential_type: cred.type || cred.name || 'Credential',
          credential_name: cred.name || cred.type || 'Certification',
          license_number: cred.licenseNumber || cred.license_number || '',
          issue_date: cred.issueDate || cred.issue_date || '',
          expiration_date: cred.expirationDate || cred.expiration_date || '',
          status: cred.status || 'ACTIVE',
          background_check_status: c.background_check?.status || 'CLEARED',
          hire_date: c.hire_date || '',
        });
      }
    } else {
      credentialRows.push({
        caregiver_id: c.id,
        employee_number: c.employee_number || '',
        caregiver_name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
        role: c.role || '',
        employment_status: c.employment_status || '',
        compliance_status: c.compliance_status || '',
        credential_type: 'General',
        credential_name: 'Employment Record',
        license_number: '',
        issue_date: '',
        expiration_date: '',
        status: c.employment_status || 'ACTIVE',
        background_check_status: c.background_check?.status || 'CLEARED',
        hire_date: c.hire_date || '',
      });
    }
  }

  // 4. Fetch Visit Notes
  const noteParams: unknown[] = [organizationId];
  const noteConditions = ['organization_id = $1', 'deleted_at IS NULL'];
  if (startDate) {
    noteParams.push(startDate);
    noteConditions.push(`created_at >= $${noteParams.length}`);
  }
  if (endDate) {
    noteParams.push(endDate);
    noteConditions.push(`created_at <= $${noteParams.length}`);
  }
  const notesQuery = `
    SELECT 
      id, visit_id, evv_record_id, caregiver_id, note_type, note_text,
      activities_performed, client_mood, client_condition_notes, is_incident,
      created_at, created_by, caregiver_signed, caregiver_signed_at, client_signed
    FROM visit_notes
    WHERE ${noteConditions.join(' AND ')}
    ORDER BY created_at DESC
  `;
  const notesRes = await db.query(notesQuery, noteParams).catch(() => ({ rows: [] }));
  const noteRows = notesRes.rows.map((r: Record<string, any>) => ({
    id: r.id,
    visit_id: r.visit_id || '',
    evv_record_id: r.evv_record_id || '',
    caregiver_id: r.caregiver_id || '',
    note_type: r.note_type || 'VISIT_NOTE',
    note_text: r.note_text || '',
    activities_performed: r.activities_performed ? JSON.stringify(r.activities_performed) : '',
    client_mood: r.client_mood || '',
    client_condition: r.client_condition_notes || '',
    is_incident: r.is_incident ? 'YES' : 'NO',
    created_at: r.created_at || '',
    created_by: r.created_by || '',
    caregiver_signed: r.caregiver_signed ? 'YES' : 'NO',
    caregiver_signed_at: r.caregiver_signed_at || '',
    client_signed: r.client_signed ? 'YES' : 'NO',
  }));

  // 5. Generate Manifest
  const exportTimestamp = new Date().toISOString();
  const manifest = {
    exportPackage: 'FolkCare Regulatory Audit Pack',
    version: '1.0.0',
    organizationId,
    exportedAt: exportTimestamp,
    exportedBy: {
      userId: req.user?.userId,
      roles: req.user?.roles,
    },
    ipAddress: req.ip || req.socket.remoteAddress,
    dateRange: {
      startDate: startDate || null,
      endDate: endDate || null,
    },
    recordCounts: {
      clients: clientRows.length,
      evvLogs: evvRows.length,
      caregiverCredentials: credentialRows.length,
      visitNotes: noteRows.length,
    },
    complianceStandards: [
      'HIPAA Security Rule 45 CFR § 164.312(b) Audit Controls',
      'HIPAA Privacy Rule 45 CFR § 164.530(j) Documentation Retention',
      '21st Century Cures Act Electronic Visit Verification (EVV) Mandate',
      'State Licensing Survey & Regulatory Review Requirements',
    ],
    confidentialityNotice:
      'CONFIDENTIAL ePHI - Protected Healthcare Information. Disclose only to authorized survey personnel.',
  };

  // 6. Audit Trail Logging for HIPAA Security Rule Compliance
  const auditService = new AuditService(db);
  const userContext: UserContext = {
    userId: req.user!.userId,
    organizationId,
    roles: req.user!.roles,
    permissions: req.user!.permissions,
    branchIds: req.user!.branchIds ?? [],
  };

  await auditService.logEvent(userContext, {
    eventType: 'COMPLIANCE',
    resource: 'regulatory_audit_pack',
    resourceId: organizationId,
    action: 'EXPORT_AUDIT_PACK',
    result: 'SUCCESS',
    metadata: {
      clientCount: clientRows.length,
      evvLogCount: evvRows.length,
      caregiverCredentialsCount: credentialRows.length,
      visitNoteCount: noteRows.length,
      startDate: startDate || null,
      endDate: endDate || null,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    },
    ipAddress: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'] as string | undefined,
  });

  // 7. Stream ZIP archive response
  const dateSuffix = exportTimestamp.slice(0, 10);
  const zipFilename = `audit-pack-${organizationId.slice(0, 8)}-${dateSuffix}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (err: Error) => {
    console.error('ZIP archive generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create zip archive' });
    }
  });

  archive.pipe(res);

  if (validated.format === 'json') {
    archive.append(JSON.stringify(clientRows, null, 2), { name: 'clients.json' });
    archive.append(JSON.stringify(evvRows, null, 2), { name: 'evv_logs.json' });
    archive.append(JSON.stringify(credentialRows, null, 2), { name: 'caregiver_credentials.json' });
    archive.append(JSON.stringify(noteRows, null, 2), { name: 'visit_notes.json' });
  } else {
    archive.append(Papa.unparse(clientRows), { name: 'clients.csv' });
    archive.append(Papa.unparse(evvRows), { name: 'evv_logs.csv' });
    archive.append(Papa.unparse(credentialRows), { name: 'caregiver_credentials.csv' });
    archive.append(Papa.unparse(noteRows), { name: 'visit_notes.csv' });
  }

  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

  await archive.finalize();
}));

export default router;

