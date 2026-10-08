/**
 * EVV evidence repository
 *
 * Loads the EVV record behind each billable item so the EVV-before-billing gate
 * evaluates what was actually captured at the point of care. Evidence is never
 * accepted from API callers and never synthesized: a billable item without an
 * EVV record yields an input with no clock times, which the gate blocks.
 */

import { Pool } from 'pg';
import { UUID } from '@folkcare/core';
import {
  EVVLocationVerificationData,
  EVVVisitVerificationInput,
  InvoiceStatus,
  PayerType,
  UnitType,
} from '../types/billing.js';

export interface BillableItemEvidence {
  billableItemId: UUID;
  branchId: UUID;
  billableItemStatus: string;
  isDenied: boolean;
  denialReason?: string;
  invoiceId?: UUID;
  invoiceNumber?: string;
  invoiceStatus?: InvoiceStatus;
  invoiceDate?: Date;
  payerId: UUID;
  payerType: PayerType;
  payerName: string;
  serviceTypeCode: string;
  serviceTypeName: string;
  serviceDate: Date;
  units: number;
  unitType: UnitType;
  unitRate: number;
  finalAmount: number;
  createdAt: Date;
  updatedAt: Date;
  hasEvvRecord: boolean;
  evv: EVVVisitVerificationInput;
}

const EVIDENCE_SELECT = `
  SELECT
    bi.id AS bi_id, bi.branch_id AS bi_branch_id, bi.status AS bi_status, bi.is_denied, bi.denial_reason,
    bi.visit_id AS bi_visit_id, bi.client_id AS bi_client_id,
    bi.caregiver_id AS bi_caregiver_id, bi.caregiver_name AS bi_caregiver_name,
    bi.provider_npi AS bi_provider_npi,
    bi.service_type_code AS bi_service_type_code, bi.service_type_name AS bi_service_type_name,
    bi.service_date AS bi_service_date, bi.duration_minutes,
    bi.units, bi.unit_type, bi.unit_rate, bi.final_amount,
    bi.payer_id, bi.payer_type, bi.payer_name,
    bi.created_at AS bi_created_at, bi.updated_at AS bi_updated_at,
    inv.id AS inv_id, inv.invoice_number, inv.status AS inv_status, inv.invoice_date,
    NULLIF(TRIM(CONCAT_WS(' ', cl.first_name, cl.last_name)), '') AS cl_name,
    er.id AS er_id, er.service_type_code, er.service_type_name,
    er.client_id, er.client_name, er.client_medicaid_id,
    er.caregiver_id, er.caregiver_name, er.caregiver_npi, er.caregiver_employee_id,
    er.service_date, er.service_address, er.clock_in_time, er.clock_out_time,
    er.total_duration, er.clock_in_verification, er.clock_out_verification
  FROM billable_items bi
  LEFT JOIN invoices inv
    ON inv.id = bi.invoice_id AND inv.deleted_at IS NULL
  LEFT JOIN clients cl
    ON cl.id = bi.client_id
  LEFT JOIN LATERAL (
    SELECT e.*
    FROM evv_records e
    WHERE e.organization_id = bi.organization_id
      AND (e.id = bi.evv_record_id OR (bi.evv_record_id IS NULL AND e.visit_id = bi.visit_id))
      AND e.record_status NOT IN ('VOIDED', 'REJECTED')
    ORDER BY (e.id = bi.evv_record_id) DESC
    LIMIT 1
  ) er ON TRUE
`;

// Full statements are assembled once at load time from static fragments; every
// value is passed as a bind parameter.
const BY_BILLABLE_ITEM_IDS_SQL =
  EVIDENCE_SELECT +
  `WHERE bi.organization_id = $1 AND bi.id = ANY($2) AND bi.deleted_at IS NULL`;

const READY_UNINVOICED_SQL =
  EVIDENCE_SELECT +
  `WHERE bi.organization_id = $1 AND bi.deleted_at IS NULL
     AND bi.status = 'READY' AND bi.invoice_id IS NULL AND COALESCE(bi.is_hold, FALSE) = FALSE
     AND ($2::uuid IS NULL OR bi.payer_id = $2)
   ORDER BY bi.service_date ASC
   LIMIT 1000`;

const CLAIMS_QUEUE_SQL =
  EVIDENCE_SELECT +
  `WHERE bi.organization_id = $1 AND bi.deleted_at IS NULL AND bi.status <> 'VOIDED'
   ORDER BY bi.service_date DESC, bi.created_at DESC
   LIMIT $2`;

export class EVVEvidenceRepository {
  constructor(private pool: Pool) {}

  /** Evidence for specific billable items (e.g. the line items of one invoice). */
  async findByBillableItemIds(
    organizationId: UUID,
    billableItemIds: UUID[]
  ): Promise<BillableItemEvidence[]> {
    if (billableItemIds.length === 0) return [];
    const result = await this.pool.query(BY_BILLABLE_ITEM_IDS_SQL, [organizationId, billableItemIds]);
    return result.rows.map(mapEvidenceRow);
  }

  /** Billable items in READY status that are not on an invoice yet. */
  async findReadyUninvoiced(organizationId: UUID, payerId?: UUID): Promise<BillableItemEvidence[]> {
    const result = await this.pool.query(READY_UNINVOICED_SQL, [organizationId, payerId ?? null]);
    return result.rows.map(mapEvidenceRow);
  }

  /** Recent billable items (billed or not) for the claims queue. */
  async findForClaimsQueue(organizationId: UUID, limit = 500): Promise<BillableItemEvidence[]> {
    const result = await this.pool.query(CLAIMS_QUEUE_SQL, [organizationId, limit]);
    return result.rows.map(mapEvidenceRow);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function parseJson<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
}

/**
 * Map a stored LocationVerification (time-tracking-evv) to the gate's shape.
 * Spoofed GPS never counts as inside the geofence; a stored manual override
 * counts as approved only when it names the supervisor who approved it.
 */
function mapVerification(raw: unknown): EVVLocationVerificationData | undefined {
  const v = parseJson<Row>(raw);
  if (!v) return undefined;
  const override = v.manualOverride as Row | undefined;
  return {
    latitude: v.latitude,
    longitude: v.longitude,
    accuracyMeters: v.accuracy,
    isWithinGeofence: v.isWithinGeofence === true && v.mockLocationDetected !== true,
    timestamp: v.timestamp,
    ...(override
      ? {
          manualOverride: {
            isApproved: Boolean(override.overrideBy) && Boolean(override.overrideAt),
            reason: String(override.reason ?? ''),
            reasonCode: override.reasonCode,
            approvedBy: override.overrideBy,
            approvedAt: override.overrideAt,
          },
        }
      : {}),
  };
}

function mapEvidenceRow(row: Row): BillableItemEvidence {
  const hasEvvRecord = Boolean(row.er_id);
  const address = parseJson<Row>(row.service_address);
  const clockIn = mapVerification(row.clock_in_verification);
  const clockOut = mapVerification(row.clock_out_verification);

  const evv: EVVVisitVerificationInput = {
    visitId: row.bi_visit_id ?? row.bi_id,
    serviceTypeCode: (hasEvvRecord ? row.service_type_code : row.bi_service_type_code) ?? '',
    serviceTypeName: (hasEvvRecord ? row.service_type_name : row.bi_service_type_name) ?? '',
    clientId: (hasEvvRecord ? row.client_id : row.bi_client_id) ?? '',
    // Display fallback only: the gate checks client identity via clientId.
    clientName: row.client_name ?? row.cl_name ?? '',
    ...(row.client_medicaid_id ? { clientMedicaidId: row.client_medicaid_id } : {}),
    caregiverId: (hasEvvRecord ? row.caregiver_id : row.bi_caregiver_id) ?? '',
    caregiverName: (hasEvvRecord ? row.caregiver_name : row.bi_caregiver_name) ?? '',
    ...(row.caregiver_npi ?? row.bi_provider_npi
      ? { caregiverNPI: row.caregiver_npi ?? row.bi_provider_npi }
      : {}),
    serviceDate: (hasEvvRecord ? row.service_date : row.bi_service_date) ?? '',
    ...(address
      ? {
          serviceAddress: {
            line1: address.line1,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            latitude: address.latitude,
            longitude: address.longitude,
          },
        }
      : {}),
    // Without an EVV record there is no clock-in; the gate blocks on that.
    clockInTime: hasEvvRecord ? row.clock_in_time : '',
    clockOutTime: hasEvvRecord ? row.clock_out_time : null,
    ...(row.total_duration != null ? { durationMinutes: row.total_duration } : {}),
    ...(clockIn ? { clockInVerification: clockIn } : {}),
    ...(clockOut ? { clockOutVerification: clockOut } : {}),
    payerId: row.payer_id,
    payerName: row.payer_name,
    payerType: row.payer_type,
  };

  return {
    billableItemId: row.bi_id,
    branchId: row.bi_branch_id,
    billableItemStatus: row.bi_status,
    isDenied: row.is_denied === true,
    ...(row.denial_reason ? { denialReason: row.denial_reason } : {}),
    ...(row.inv_id
      ? {
          invoiceId: row.inv_id,
          invoiceNumber: row.invoice_number,
          invoiceStatus: row.inv_status,
          invoiceDate: row.invoice_date,
        }
      : {}),
    payerId: row.payer_id,
    payerType: row.payer_type,
    payerName: row.payer_name,
    serviceTypeCode: row.bi_service_type_code,
    serviceTypeName: row.bi_service_type_name,
    serviceDate: row.bi_service_date,
    units: parseFloat(row.units),
    unitType: row.unit_type,
    unitRate: parseFloat(row.unit_rate),
    finalAmount: parseFloat(row.final_amount),
    createdAt: row.bi_created_at,
    updatedAt: row.bi_updated_at,
    hasEvvRecord,
    evv,
  };
}
