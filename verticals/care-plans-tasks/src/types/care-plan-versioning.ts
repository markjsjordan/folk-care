/**
 * Care Plan Versioning, Templates & Signatures Domain Types (FC-020)
 * 
 * Implements immutable versioning for Medicaid audit readiness,
 * template families, and digital signatures with audit hashes.
 */

import { UUID } from '@folkcare/core';
import { CarePlan } from './care-plan.js';

export type TemplateStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';
export type CarePlanVersionStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'REVIEWED' | 'ARCHIVED';

/**
 * Stable template family definition
 */
export interface TemplateFamily {
  id: UUID;
  organizationId: UUID;
  code: string;
  name: string;
  category: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Versioned template definition
 */
export interface TemplateVersion {
  id: UUID;
  familyId: UUID;
  versionNumber: string;
  status: TemplateStatus;
  schemaDefinition: Record<string, unknown>;
  effectiveDate: Date;
  createdBy?: UUID | null;
  createdAt: Date;
}

/**
 * Digital signature with audit trail for UETA/ESIGN & Medicaid compliance
 */
export interface DigitalSignature {
  id: UUID;
  signerId: UUID;
  signerRole: string;
  signatureSvg: string;
  signedAt: Date;
  ipAddress?: string | null;
  auditHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export type SignatureEntity = DigitalSignature;

/**
 * Immutable snapshot of a care plan at a specific version
 */
export interface CarePlanVersion {
  id: UUID;
  carePlanId: UUID;
  versionNumber: number;
  status: CarePlanVersionStatus;
  content: CarePlan | Record<string, unknown>;
  effectiveStart: Date;
  effectiveEnd?: Date | null;
  supersededByVersionId?: UUID | null;
  changeReason?: string | null;
  signatureId?: UUID | null;
  signature?: DigitalSignature | null;
  createdAt: Date;
  createdBy?: UUID | null;
  diffFromPrevious?: CarePlanVersionDiff | null;
}

/**
 * Diff inspection between care plan versions for audit trails
 */
export interface CarePlanVersionDiff {
  previousVersion: number;
  currentVersion: number;
  changedFields: string[];
  goalsChanged: boolean;
  interventionsChanged: boolean;
  tasksChanged: boolean;
  summary: string;
}

/**
 * Inputs
 */
export interface CreateTemplateFamilyInput {
  organizationId: UUID;
  code: string;
  name: string;
  category: string;
  isActive?: boolean;
}

export interface CreateTemplateVersionInput {
  familyId: UUID;
  versionNumber: string;
  status?: TemplateStatus;
  schemaDefinition: Record<string, unknown>;
  effectiveDate?: Date;
  createdBy?: UUID;
}

export interface CreateSignatureInput {
  signerId: UUID;
  signerRole: string;
  signatureSvg: string;
  signedAt?: Date;
  ipAddress?: string;
  auditHash?: string;
}

export interface CreateCarePlanVersionInput {
  carePlanId: UUID;
  versionNumber: number;
  status?: CarePlanVersionStatus;
  content: CarePlan | Record<string, unknown>;
  effectiveStart?: Date;
  effectiveEnd?: Date;
  supersededByVersionId?: UUID;
  changeReason?: string;
  signatureId?: UUID;
  createdBy?: UUID;
}

/**
 * Anything that can run a parameterised query: the pool-backed Database or a
 * transaction client. Lets repositories join a caller-managed transaction.
 */
export interface Queryable {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface ClinicalReviewInput {
  changeReason: string;
  reviewDate?: Date;
  signature?: {
    signerId: UUID;
    signerRole: string;
    signatureSvg: string;
    ipAddress?: string;
  };
  contentOverrides?: Partial<CarePlan>;
  stateJurisdiction?: 'TX' | 'FL' | string;
}
