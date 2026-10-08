/**
 * Care Plan Version Repository
 * 
 * Data access layer for immutable care plan versions and digital signatures
 */

import { Database, UUID } from '@folkcare/core';
import { createHash } from 'node:crypto';
import {
  CarePlanVersion,
  CreateCarePlanVersionInput,
  DigitalSignature,
  CreateSignatureInput,
  CarePlanVersionStatus,
  Queryable,
} from '../types/care-plan-versioning.js';

export class CarePlanVersionRepository {
  private database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  /**
   * Create an audit-logged digital signature
   */
  async createSignature(input: CreateSignatureInput, executor: Queryable = this.database): Promise<DigitalSignature> {
    const signedAt = input.signedAt || new Date();
    const auditHash =
      input.auditHash ||
      createHash('sha256')
        .update(
          `${input.signerId}:${input.signerRole}:${input.signatureSvg}:${signedAt.toISOString()}:${input.ipAddress || ''}`
        )
        .digest('hex');

    const query = `
      INSERT INTO signatures (
        id,
        signer_id,
        signer_role,
        signature_svg,
        signed_at,
        ip_address,
        audit_hash,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, $6, NOW(), NOW()
      )
      RETURNING *
    `;

    const result = await executor.query(query, [
      input.signerId,
      input.signerRole,
      input.signatureSvg,
      signedAt,
      input.ipAddress || null,
      auditHash,
    ]);

    if (!result.rows[0]) {
      throw new Error('Failed to create signature - no row returned');
    }

    return this.mapRowToSignature(result.rows[0]);
  }

  /**
   * Get signature by ID
   */
  async getSignatureById(id: UUID): Promise<DigitalSignature | null> {
    const query = `SELECT * FROM signatures WHERE id = $1`;
    const result = await this.database.query(query, [id]);
    return result.rows[0] ? this.mapRowToSignature(result.rows[0]) : null;
  }

  /**
   * Create an immutable care plan version snapshot
   */
  async createCarePlanVersion(input: CreateCarePlanVersionInput, executor: Queryable = this.database): Promise<CarePlanVersion> {
    const query = `
      INSERT INTO care_plan_versions (
        id,
        care_plan_id,
        version_number,
        status,
        content,
        effective_start,
        effective_end,
        superseded_by_version_id,
        change_reason,
        signature_id,
        created_at,
        created_by
      ) VALUES (
        gen_random_uuid(),
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10
      )
      RETURNING *
    `;

    const result = await executor.query(query, [
      input.carePlanId,
      input.versionNumber,
      input.status || 'ACTIVE',
      JSON.stringify(input.content),
      input.effectiveStart || new Date(),
      input.effectiveEnd || null,
      input.supersededByVersionId || null,
      input.changeReason || null,
      input.signatureId || null,
      input.createdBy || null,
    ]);

    if (!result.rows[0]) {
      throw new Error('Failed to create care plan version - no row returned');
    }

    return this.mapRowToCarePlanVersion(result.rows[0]);
  }

  /**
   * Get all versions for a care plan in ascending version order
   */
  async getCarePlanVersions(carePlanId: UUID): Promise<CarePlanVersion[]> {
    const query = `
      SELECT v.*,
             s.signer_id, s.signer_role, s.signature_svg, s.signed_at, s.ip_address, s.audit_hash
      FROM care_plan_versions v
      LEFT JOIN signatures s ON v.signature_id = s.id
      WHERE v.care_plan_id = $1
      ORDER BY v.version_number ASC
    `;

    const result = await this.database.query(query, [carePlanId]);
    return result.rows.map((row) => this.mapRowToCarePlanVersionWithSignature(row));
  }

  /**
   * Get version by ID
   */
  async getCarePlanVersionById(id: UUID): Promise<CarePlanVersion | null> {
    const query = `
      SELECT v.*,
             s.signer_id, s.signer_role, s.signature_svg, s.signed_at, s.ip_address, s.audit_hash
      FROM care_plan_versions v
      LEFT JOIN signatures s ON v.signature_id = s.id
      WHERE v.id = $1
    `;

    const result = await this.database.query(query, [id]);
    return result.rows[0] ? this.mapRowToCarePlanVersionWithSignature(result.rows[0]) : null;
  }

  /**
   * Get latest version for a care plan
   */
  async getLatestCarePlanVersion(carePlanId: UUID, executor: Queryable = this.database): Promise<CarePlanVersion | null> {
    const query = `
      SELECT v.*,
             s.signer_id, s.signer_role, s.signature_svg, s.signed_at, s.ip_address, s.audit_hash
      FROM care_plan_versions v
      LEFT JOIN signatures s ON v.signature_id = s.id
      WHERE v.care_plan_id = $1
      ORDER BY v.version_number DESC
      LIMIT 1
    `;

    const result = await executor.query(query, [carePlanId]);
    return result.rows[0] ? this.mapRowToCarePlanVersionWithSignature(result.rows[0]) : null;
  }

  /**
   * Get specific version number for a care plan
   */
  async getCarePlanVersionByNumber(
    carePlanId: UUID,
    versionNumber: number
  ): Promise<CarePlanVersion | null> {
    const query = `
      SELECT v.*,
             s.signer_id, s.signer_role, s.signature_svg, s.signed_at, s.ip_address, s.audit_hash
      FROM care_plan_versions v
      LEFT JOIN signatures s ON v.signature_id = s.id
      WHERE v.care_plan_id = $1 AND v.version_number = $2
    `;

    const result = await this.database.query(query, [carePlanId, versionNumber]);
    return result.rows[0] ? this.mapRowToCarePlanVersionWithSignature(result.rows[0]) : null;
  }

  /**
   * Mark a version as superseded
   */
  async supersedeVersion(
    id: UUID,
    supersededByVersionId: UUID,
    effectiveEnd: Date = new Date(),
    executor: Queryable = this.database
  ): Promise<void> {
    const query = `
      UPDATE care_plan_versions
      SET status = 'SUPERSEDED',
          superseded_by_version_id = $2,
          effective_end = $3
      WHERE id = $1
    `;

    await executor.query(query, [id, supersededByVersionId, effectiveEnd]);
  }

  /**
   * Helper: Map row to Signature entity
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRowToSignature(row: any): DigitalSignature {
    return {
      id: row.id,
      signerId: row.signer_id,
      signerRole: row.signer_role,
      signatureSvg: row.signature_svg,
      signedAt: new Date(row.signed_at),
      ipAddress: row.ip_address,
      auditHash: row.audit_hash,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Helper: Map row to CarePlanVersion entity
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRowToCarePlanVersion(row: any): CarePlanVersion {
    const content = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
    return {
      id: row.id,
      carePlanId: row.care_plan_id,
      versionNumber: Number(row.version_number),
      status: row.status as CarePlanVersionStatus,
      content,
      effectiveStart: new Date(row.effective_start),
      effectiveEnd: row.effective_end ? new Date(row.effective_end) : null,
      supersededByVersionId: row.superseded_by_version_id,
      changeReason: row.change_reason,
      signatureId: row.signature_id,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
    };
  }

  /**
   * Helper: Map row with joined signature to CarePlanVersion entity
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRowToCarePlanVersionWithSignature(row: any): CarePlanVersion {
    const version = this.mapRowToCarePlanVersion(row);
    if (row.signature_id && row.signature_svg) {
      version.signature = {
        id: row.signature_id,
        signerId: row.signer_id,
        signerRole: row.signer_role,
        signatureSvg: row.signature_svg,
        signedAt: new Date(row.signed_at),
        ipAddress: row.ip_address,
        auditHash: row.audit_hash,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.created_at),
      };
    }
    return version;
  }
}
