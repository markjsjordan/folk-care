/**
 * Care Plan Versioning Unit Tests (FC-020)
 *
 * Verifies:
 * 1. Initial Care Plan version snapshot (v1) generation on creation.
 * 2. Version bumping upon plan modification (v1 -> v2) with previous version marked SUPERSEDED.
 * 3. Clinical plan review versioning (createPlanReviewVersion) with:
 *    - Texas HHSC 60-day review interval enforcement (26 TAC §558.287).
 *    - Florida AHCA 60-day (skilled nursing) and 90-day (personal care) review intervals (Chapter 59A-8).
 *    - Digital signature capture with SHA-256 non-repudiation audit hash.
 * 4. Care plan version history inspection and diff generation (computeCarePlanDiff).
 * 5. Template family & semantic template version lookup in TemplateService.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CarePlanService } from '../care-plan-service.js';
import { TemplateService } from '../template.service.js';
import { CarePlanVersionRepository } from '../../repository/care-plan-version-repository.js';
import {
  CarePlan,
  CarePlanGoal,
  Intervention,
  CreateCarePlanInput,
  UpdateCarePlanInput,
} from '../../types/care-plan.js';
import {
  ClinicalReviewInput,
  CarePlanVersion,
  TemplateFamily,
  TemplateVersion,
} from '../../types/care-plan-versioning.js';
import { Database, UserContext, UUID } from '@folkcare/core';
import crypto from 'node:crypto';
import { differenceInCalendarDays } from 'date-fns';

describe('Care Plan Versioning (FC-020)', () => {
  const fixedNow = new Date('2026-10-01T12:00:00.000Z');
  const orgId: UUID = '00000000-0000-4000-8000-000000000001';
  const userId: UUID = '00000000-0000-4000-8000-000000000002';
  const planId: UUID = '00000000-0000-4000-8000-000000000010';
  const clientId: UUID = '00000000-0000-4000-8000-000000000020';
  // eslint-disable-next-line sonarjs/no-hardcoded-ip -- fixture value for signature audit trail
  const signerIp = '192.0.2.10';

  const mockContext: UserContext = {
    userId,
    organizationId: orgId,
    branchIds: [],
    roles: ['CLINICAL_SUPERVISOR'],
    permissions: [
      'care-plans:read',
      'care-plans:write',
      'care-plans:delete',
      'care-plans:approve',
    ],
  };

  let mockCarePlanRepo: any;
  let mockVersionRepo: any;
  let mockTemplateFamilyRepo: any;
  let mockPermissions: any;
  let mockUserRepo: any;
  let carePlanService: CarePlanService;
  let templateService: TemplateService;

  const goalId: UUID = '00000000-0000-4000-8000-000000000030';
  const interventionId: UUID = '00000000-0000-4000-8000-000000000040';

  const sampleGoal: CarePlanGoal = {
    id: goalId,
    name: 'Ambulation',
    description: 'Independent ambulation with walker',
    targetDate: new Date('2026-12-01T12:00:00.000Z'),
    status: 'IN_PROGRESS',
    category: 'MOBILITY',
    priority: 'HIGH',
  };

  const sampleIntervention = {
    id: interventionId,
    name: 'Blood pressure monitoring',
    description: 'Daily blood pressure check',
    category: 'VITAL_SIGNS_MONITORING',
    goalIds: [goalId],
    frequency: { pattern: 'DAILY' },
    instructions: 'Record BP each visit',
    performedBy: ['RN'],
    requiresDocumentation: true,
    status: 'ACTIVE',
    startDate: fixedNow,
  } as Intervention;

  const sampleCarePlan: CarePlan = {
    id: planId,
    planNumber: 'CP-2026-0001',
    organizationId: orgId,
    clientId,
    name: 'Comprehensive Post-Stroke Recovery Plan',
    planType: 'SKILLED_NURSING',
    status: 'ACTIVE',
    priority: 'HIGH',
    currentVersion: 1,
    effectiveDate: fixedNow,
    expirationDate: new Date('2027-10-01T12:00:00.000Z'),
    reviewDate: fixedNow,
    goals: [sampleGoal],
    interventions: [sampleIntervention],
    taskTemplates: [],
    notes: 'Initial clinical assessment completed.',
    version: 1,
    createdAt: fixedNow,
    updatedAt: fixedNow,
    complianceStatus: 'COMPLIANT',
    createdBy: userId,
    updatedBy: userId,
    deletedAt: null,
    deletedBy: null,
  };

  /** Calendar days between reviewDate and the nextReviewDue passed to the repository */
  const reviewIntervalFromCall = (callIndex = 0): number => {
    const call = mockCarePlanRepo.updatePlanVersionAndReview.mock.calls[callIndex];
    return differenceInCalendarDays(call[3] as Date, call[2] as Date);
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockCarePlanRepo = {
      createCarePlan: vi.fn(),
      getCarePlanById: vi.fn(),
      updateCarePlan: vi.fn(),
      updatePlanVersionAndReview: vi.fn(),
      getDatabase: vi.fn().mockReturnValue(null),
    };

    mockVersionRepo = {
      createCarePlanVersion: vi.fn(),
      getCarePlanVersions: vi.fn(),
      getLatestCarePlanVersion: vi.fn(),
      supersedeVersion: vi.fn(),
      createSignature: vi.fn(),
    };

    mockTemplateFamilyRepo = {
      getTemplateFamilyByCode: vi.fn(),
      getTemplateFamilyById: vi.fn(),
      listTemplateFamilies: vi.fn(),
      createTemplateFamily: vi.fn(),
      createTemplateVersion: vi.fn(),
      getLatestTemplateVersion: vi.fn(),
      getTemplateVersions: vi.fn(),
    };

    mockPermissions = {
      hasPermission: vi.fn().mockReturnValue(true),
    };

    mockUserRepo = {
      getUserById: vi.fn().mockResolvedValue({ id: userId, organizationId: orgId }),
    };

    carePlanService = new CarePlanService(
      mockCarePlanRepo,
      mockPermissions,
      mockUserRepo,
      mockVersionRepo
    );

    templateService = new TemplateService(
      mockCarePlanRepo,
      mockTemplateFamilyRepo
    );
  });

  describe('1. Initial Care Plan Version Snapshot (v1)', () => {
    it('creates version snapshot v1 when care plan is initially created', async () => {
      const createInput: CreateCarePlanInput = {
        organizationId: orgId,
        clientId,
        name: 'Comprehensive Post-Stroke Recovery Plan',
        planType: 'SKILLED_NURSING',
        effectiveDate: fixedNow,
        goals: [sampleGoal],
        interventions: [sampleIntervention],
        taskTemplates: [],
      };

      mockCarePlanRepo.createCarePlan.mockResolvedValue(sampleCarePlan);
      mockVersionRepo.createCarePlanVersion.mockResolvedValue({
        id: 'ver-1',
        carePlanId: planId,
        versionNumber: 1,
        status: 'ACTIVE',
        content: sampleCarePlan,
        effectiveStart: fixedNow,
        changeReason: 'Initial care plan creation',
        createdBy: userId,
        createdAt: fixedNow,
      });

      const result = await carePlanService.createCarePlan(createInput, mockContext);

      expect(mockCarePlanRepo.createCarePlan).toHaveBeenCalledWith(
        expect.objectContaining({ clientId, organizationId: orgId, createdBy: userId }),
        undefined
      );
      expect(mockVersionRepo.createCarePlanVersion).toHaveBeenCalledWith({
        carePlanId: planId,
        versionNumber: 1,
        status: 'ACTIVE',
        content: sampleCarePlan,
        effectiveStart: sampleCarePlan.effectiveDate,
        changeReason: 'Initial care plan creation',
        createdBy: userId,
      }, undefined);
      expect(result.currentVersion).toBe(1);
    });
  });

  describe('2. Version Bumping Upon Modification (Immutability)', () => {
    it('bumps version from v1 to v2 and marks previous version SUPERSEDED', async () => {
      const updateInput: UpdateCarePlanInput = {
        name: 'Updated Post-Stroke Recovery Plan',
        notes: 'Adjusted physical therapy frequency',
      };

      const existingPlan: CarePlan = { ...sampleCarePlan, currentVersion: 1 };
      const updatedPlan: CarePlan = {
        ...sampleCarePlan,
        name: 'Updated Post-Stroke Recovery Plan',
        notes: 'Adjusted physical therapy frequency',
        currentVersion: 2,
      };

      const prevVersion: CarePlanVersion = {
        id: 'ver-1',
        carePlanId: planId,
        versionNumber: 1,
        status: 'ACTIVE',
        content: existingPlan,
        effectiveStart: fixedNow,
        createdAt: fixedNow,
        createdBy: userId,
      };

      const newVersion: CarePlanVersion = {
        id: 'ver-2',
        carePlanId: planId,
        versionNumber: 2,
        status: 'ACTIVE',
        content: updatedPlan,
        effectiveStart: fixedNow,
        changeReason: 'Care plan updated',
        createdBy: userId,
        createdAt: fixedNow,
      };

      mockCarePlanRepo.getCarePlanById.mockResolvedValue(existingPlan);
      mockCarePlanRepo.updateCarePlan.mockResolvedValue(updatedPlan);
      mockVersionRepo.getLatestCarePlanVersion.mockResolvedValue(prevVersion);
      mockVersionRepo.createCarePlanVersion.mockResolvedValue(newVersion);
      mockVersionRepo.supersedeVersion.mockResolvedValue(undefined);

      const result = await carePlanService.updateCarePlan(planId, updateInput, mockContext);

      expect(result.currentVersion).toBe(2);
      expect(mockVersionRepo.getLatestCarePlanVersion).toHaveBeenCalledWith(planId, undefined);
      expect(mockVersionRepo.createCarePlanVersion).toHaveBeenCalledWith({
        carePlanId: planId,
        versionNumber: 2,
        status: 'ACTIVE',
        content: updatedPlan,
        effectiveStart: expect.any(Date),
        changeReason: 'Care plan modified',
        createdBy: userId,
      }, undefined);
      expect(mockVersionRepo.supersedeVersion).toHaveBeenCalledWith(
        prevVersion.id,
        newVersion.id,
        expect.any(Date),
        undefined
      );
      expect(result.name).toBe('Updated Post-Stroke Recovery Plan');
    });
  });

  describe('3. Clinical Plan Review Versioning & Regulatory Intervals', () => {
    it('enforces 60-day review interval for Texas HHSC compliance (26 TAC §558.287)', async () => {
      const reviewDate = new Date('2026-10-01T00:00:00.000Z');
      const reviewInput: ClinicalReviewInput = {
        stateJurisdiction: 'TX',
        changeReason: 'Texas HHSC mandatory 60-day clinical plan recertification',
        reviewDate,
        signature: {
          signerId: userId,
          signerRole: 'RN_SUPERVISOR',
          signatureSvg: '<svg>test-signature</svg>',
          ipAddress: signerIp,
        },
      };

      mockCarePlanRepo.getCarePlanById.mockResolvedValue(sampleCarePlan);
      mockVersionRepo.createSignature.mockResolvedValue({
        id: 'sig-tx-1',
        signerId: userId,
        signerRole: 'RN_SUPERVISOR',
        signatureSvg: '<svg>test-signature</svg>',
        signedAt: reviewDate,
        ipAddress: signerIp,
        auditHash: 'fake-audit-hash',
      });
      mockVersionRepo.getLatestCarePlanVersion.mockResolvedValue({
        id: 'ver-1',
        carePlanId: planId,
        versionNumber: 1,
        status: 'ACTIVE',
        content: sampleCarePlan,
        effectiveStart: fixedNow,
        createdAt: fixedNow,
        createdBy: userId,
      });

      const updatedPlan: CarePlan = {
        ...sampleCarePlan,
        currentVersion: 2,
        reviewDate,
      };
      mockCarePlanRepo.updatePlanVersionAndReview.mockResolvedValue(updatedPlan);

      mockVersionRepo.createCarePlanVersion.mockResolvedValue({
        id: 'ver-2',
        carePlanId: planId,
        versionNumber: 2,
        status: 'ACTIVE',
        content: updatedPlan,
        effectiveStart: reviewDate,
        signatureId: 'sig-tx-1',
        changeReason: reviewInput.changeReason,
        createdBy: userId,
        createdAt: reviewDate,
      });

      const result = await carePlanService.createPlanReviewVersion(planId, reviewInput, mockContext);

      // Verify Texas HHSC 60-day addition
      expect(mockCarePlanRepo.updatePlanVersionAndReview).toHaveBeenCalledWith(
        planId,
        2,
        reviewDate,
        expect.any(Date),
        userId,
        'ACTIVE',
        undefined
      );
      expect(reviewIntervalFromCall()).toBe(60);
      expect(mockVersionRepo.createSignature).toHaveBeenCalledWith({
        signerId: userId,
        signerRole: 'RN_SUPERVISOR',
        signatureSvg: '<svg>test-signature</svg>',
        ipAddress: signerIp,
        signedAt: reviewDate,
      }, undefined);
      expect(result.version.versionNumber).toBe(2);
      expect(result.version.signatureId).toBe('sig-tx-1');
    });

    it('enforces Florida AHCA 60-day interval for Skilled Nursing and 90-day for Personal Care (Chapter 59A-8)', async () => {
      const reviewDate = new Date('2026-10-01T00:00:00.000Z');

      // Test 1: Skilled Nursing -> 60 days
      const skilledPlan: CarePlan = {
        ...sampleCarePlan,
        planType: 'SKILLED_NURSING',
      };
      mockCarePlanRepo.getCarePlanById.mockResolvedValue(skilledPlan);
      mockVersionRepo.getLatestCarePlanVersion.mockResolvedValue(null);
      mockCarePlanRepo.updatePlanVersionAndReview.mockResolvedValue({
        ...skilledPlan,
        currentVersion: 2,
      });

      await carePlanService.createPlanReviewVersion(
        planId,
        {
          stateJurisdiction: 'FL',
          reviewDate,
          changeReason: 'Florida AHCA skilled nursing 60-day review',
        },
        mockContext
      );

      expect(reviewIntervalFromCall(0)).toBe(60);

      // Test 2: Personal Care -> 90 days
      const personalCarePlan: CarePlan = {
        ...sampleCarePlan,
        planType: 'PERSONAL_CARE',
        interventions: [{ ...sampleIntervention, category: 'ASSISTANCE_WITH_ADL' } as Intervention],
      };
      mockCarePlanRepo.getCarePlanById.mockResolvedValue(personalCarePlan);
      mockCarePlanRepo.updatePlanVersionAndReview.mockResolvedValue({
        ...personalCarePlan,
        currentVersion: 2,
      });

      await carePlanService.createPlanReviewVersion(
        planId,
        {
          stateJurisdiction: 'FL',
          reviewDate,
          changeReason: 'Florida AHCA personal care 90-day review',
        },
        mockContext
      );

      expect(reviewIntervalFromCall(1)).toBe(90);
    });

    it('creates SHA-256 digital signature audit hash correctly', async () => {
      const testSignerId = '00000000-0000-4000-8000-000000000099';
      const testSignedAt = new Date('2026-10-01T15:30:00.000Z');
      const testSvg = '<svg xmlns="http://www.w3.org/2000/svg">signature</svg>';
      const testIp = signerIp;

      const query = vi.fn().mockImplementation((_sql: string, params: unknown[]) => ({
        rows: [
          {
            id: 'sig-1',
            signer_id: params[0],
            signer_role: params[1],
            signature_svg: params[2],
            signed_at: params[3],
            ip_address: params[4],
            audit_hash: params[5],
            created_at: testSignedAt,
            updated_at: testSignedAt,
          },
        ],
      }));
      const repo = new CarePlanVersionRepository({ query } as unknown as Database);

      const signature = await repo.createSignature({
        signerId: testSignerId,
        signerRole: 'RN',
        signatureSvg: testSvg,
        ipAddress: testIp,
        signedAt: testSignedAt,
      });

      const expectedPayload = `${testSignerId}:RN:${testSvg}:${testSignedAt.toISOString()}:${testIp}`;
      const expectedHash = crypto.createHash('sha256').update(expectedPayload).digest('hex');

      expect(signature.auditHash).toBe(expectedHash);
      expect(signature.auditHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Transactional integrity', () => {
    it('runs plan update and version snapshot on one transaction client and propagates snapshot failures', async () => {
      const txClient = { query: vi.fn() };
      const transaction = vi.fn(async (work: (c: unknown) => Promise<unknown>) => work(txClient));
      mockCarePlanRepo.getDatabase.mockReturnValue({ transaction });

      mockCarePlanRepo.getCarePlanById.mockResolvedValue(sampleCarePlan);
      mockCarePlanRepo.updateCarePlan.mockResolvedValue({ ...sampleCarePlan, name: 'Renamed' });
      mockVersionRepo.getLatestCarePlanVersion.mockResolvedValue(null);
      mockVersionRepo.createCarePlanVersion.mockRejectedValue(new Error('snapshot write failed'));

      await expect(
        carePlanService.updateCarePlan(planId, { name: 'Renamed' }, mockContext)
      ).rejects.toThrow('snapshot write failed');

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(mockCarePlanRepo.updateCarePlan).toHaveBeenCalledWith(
        planId,
        { name: 'Renamed' },
        userId,
        txClient
      );
      expect(mockVersionRepo.createCarePlanVersion).toHaveBeenCalledWith(
        expect.objectContaining({ versionNumber: 2 }),
        txClient
      );
    });

    it('wraps clinical review writes (signature, plan, snapshot, supersede) in one transaction', async () => {
      const txClient = { query: vi.fn() };
      const transaction = vi.fn(async (work: (c: unknown) => Promise<unknown>) => work(txClient));
      mockCarePlanRepo.getDatabase.mockReturnValue({ transaction });

      const reviewDate = new Date('2026-10-01T00:00:00.000Z');
      mockCarePlanRepo.getCarePlanById.mockResolvedValue(sampleCarePlan);
      mockVersionRepo.createSignature.mockResolvedValue({ id: 'sig-1' });
      mockVersionRepo.getLatestCarePlanVersion.mockResolvedValue({ id: 'ver-1', versionNumber: 1 });
      mockCarePlanRepo.updatePlanVersionAndReview.mockResolvedValue({ ...sampleCarePlan, currentVersion: 2 });
      mockVersionRepo.createCarePlanVersion.mockResolvedValue({ id: 'ver-2', versionNumber: 2 });

      await carePlanService.createPlanReviewVersion(
        planId,
        {
          stateJurisdiction: 'TX',
          reviewDate,
          changeReason: 'Review',
          signature: { signerId: userId, signerRole: 'RN', signatureSvg: '<svg/>' },
        },
        mockContext
      );

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(mockVersionRepo.createSignature).toHaveBeenCalledWith(expect.any(Object), txClient);
      expect(mockVersionRepo.supersedeVersion).toHaveBeenCalledWith('ver-1', 'ver-2', reviewDate, txClient);
    });
  });

  describe('4. Version History Inspection & Diff Generation', () => {
    it('retrieves version history and computes granular diffs between successive versions', async () => {
      const v1Content: CarePlan = {
        ...sampleCarePlan,
        name: 'Original Name',
        notes: 'Initial notes',
        goals: [{ ...sampleGoal, description: 'Goal 1' }],
      };

      const v2Content: CarePlan = {
        ...sampleCarePlan,
        name: 'Modified Name',
        notes: 'Initial notes',
        goals: [{ ...sampleGoal, description: 'Goal 1 modified', status: 'ACHIEVED' }],
      };

      const versions: CarePlanVersion[] = [
        {
          id: 'ver-1',
          carePlanId: planId,
          versionNumber: 1,
          status: 'SUPERSEDED',
          content: v1Content,
          effectiveStart: fixedNow,
          effectiveEnd: new Date('2026-10-15T12:00:00.000Z'),
          supersededByVersionId: 'ver-2',
          createdAt: fixedNow,
          createdBy: userId,
        },
        {
          id: 'ver-2',
          carePlanId: planId,
          versionNumber: 2,
          status: 'ACTIVE',
          content: v2Content,
          effectiveStart: new Date('2026-10-15T12:00:00.000Z'),
          createdAt: new Date('2026-10-15T12:00:00.000Z'),
          createdBy: userId,
        },
      ];

      mockCarePlanRepo.getCarePlanById.mockResolvedValue(v2Content);
      mockVersionRepo.getCarePlanVersions.mockResolvedValue(versions);

      const history = await carePlanService.getCarePlanVersionHistory(planId, mockContext);

      expect(history.length).toBe(2);
      expect(history[0]?.diffFromPrevious).toBeNull();
      expect(history[1]?.diffFromPrevious).toBeDefined();
      expect(history[1]?.diffFromPrevious?.previousVersion).toBe(1);
      expect(history[1]?.diffFromPrevious?.currentVersion).toBe(2);
      expect(history[1]?.diffFromPrevious?.changedFields).toContain('name');
      expect(history[1]?.diffFromPrevious?.goalsChanged).toBe(true);
      expect(history[1]?.diffFromPrevious?.summary).toContain('name');
    });

    it('computeCarePlanDiff reports no modifications when contents are identical', () => {
      const diff = carePlanService.computeCarePlanDiff(sampleCarePlan, sampleCarePlan, 1, 2);

      expect(diff.changedFields).toEqual([]);
      expect(diff.goalsChanged).toBe(false);
      expect(diff.interventionsChanged).toBe(false);
      expect(diff.summary).toBe('Version 2: No content modifications');
    });
  });

  describe('5. Template Family & Semantic Template Versions', () => {
    it('looks up template family by organization and code in TemplateService', async () => {
      const mockFamily: TemplateFamily = {
        id: 'fam-1',
        organizationId: orgId,
        code: 'TX-MEDICAID-PERSONAL-CARE',
        name: 'Texas Medicaid Personal Care Template',
        category: 'PERSONAL_CARE',
        isActive: true,
        createdAt: fixedNow,
        updatedAt: fixedNow,
      };

      mockTemplateFamilyRepo.getTemplateFamilyByCode.mockResolvedValue(mockFamily);

      const result = await templateService.getTemplateFamilyByCode(orgId, 'TX-MEDICAID-PERSONAL-CARE');

      expect(mockTemplateFamilyRepo.getTemplateFamilyByCode).toHaveBeenCalledWith(
        orgId,
        'TX-MEDICAID-PERSONAL-CARE'
      );
      expect(result).toEqual(mockFamily);
    });

    it('lists template families filtered by category', async () => {
      const mockFamilies: TemplateFamily[] = [
        {
          id: 'fam-1',
          organizationId: orgId,
          code: 'FL-AHCA-SN-V1',
          name: 'Florida AHCA Skilled Nursing',
          category: 'SKILLED_NURSING',
          isActive: true,
          createdAt: fixedNow,
          updatedAt: fixedNow,
        },
      ];

      mockTemplateFamilyRepo.listTemplateFamilies.mockResolvedValue(mockFamilies);

      const result = await templateService.listTemplateFamilies(orgId, 'SKILLED_NURSING');

      expect(mockTemplateFamilyRepo.listTemplateFamilies).toHaveBeenCalledWith(
        orgId,
        'SKILLED_NURSING'
      );
      expect(result.length).toBe(1);
      expect(result[0]?.code).toBe('FL-AHCA-SN-V1');
    });

    it('creates a new template family and semantic template version', async () => {
      const familyInput = {
        organizationId: orgId,
        code: 'TX-STAR-PLUS-CBA',
        name: 'Texas STAR+PLUS Community Based Alternatives',
        category: 'COMMUNITY_CARE',
      };

      const createdFamily: TemplateFamily = {
        id: 'fam-star-plus',
        ...familyInput,
        isActive: true,
        createdAt: fixedNow,
        updatedAt: fixedNow,
      };

      const versionInput = {
        familyId: 'fam-star-plus',
        versionNumber: '1.0.0',
        status: 'ACTIVE' as const,
        schemaDefinition: {
          tasks: [{ title: 'Bathing assistance', frequency: 'DAILY' }],
        },
        effectiveDate: fixedNow,
        createdBy: userId,
      };

      const createdVersion: TemplateVersion = {
        id: 'ver-star-1',
        ...versionInput,
        createdAt: fixedNow,
      };

      mockTemplateFamilyRepo.createTemplateFamily.mockResolvedValue(createdFamily);
      mockTemplateFamilyRepo.createTemplateVersion.mockResolvedValue(createdVersion);

      const familyResult = await templateService.createTemplateFamily(familyInput);
      const versionResult = await templateService.createTemplateVersion(versionInput);

      expect(familyResult.id).toBe('fam-star-plus');
      expect(versionResult.versionNumber).toBe('1.0.0');
      expect(versionResult.status).toBe('ACTIVE');
    });

    it('retrieves the latest active template version for a family', async () => {
      const latestVersion: TemplateVersion = {
        id: 'ver-star-2',
        familyId: 'fam-star-plus',
        versionNumber: '1.2.0',
        status: 'ACTIVE',
        schemaDefinition: { tasks: [] },
        effectiveDate: fixedNow,
        createdAt: fixedNow,
        createdBy: userId,
      };

      mockTemplateFamilyRepo.getLatestTemplateVersion.mockResolvedValue(latestVersion);

      const result = await templateService.getLatestTemplateVersion('fam-star-plus');

      expect(mockTemplateFamilyRepo.getLatestTemplateVersion).toHaveBeenCalledWith('fam-star-plus');
      expect(result?.versionNumber).toBe('1.2.0');
    });
  });
});
