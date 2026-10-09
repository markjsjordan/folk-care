/**
 * Caregiver validator tests
 */

import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { CaregiverValidator } from '../validation/caregiver-validator';
import type { CreateCaregiverInput } from '../types/caregiver';

function buildBaseInput(overrides: Partial<CreateCaregiverInput> = {}): CreateCaregiverInput {
  const organizationId = randomUUID();

  return {
    organizationId,
    branchIds: [],
    primaryBranchId: randomUUID(),
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: new Date('1990-01-01'),
    primaryPhone: {
      number: '+15551234567',
      type: 'MOBILE',
      canReceiveSMS: true,
      isPrimary: true,
    },
    email: 'jane.doe@example.com',
    primaryAddress: {
      type: 'HOME',
      line1: '123 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    },
    emergencyContacts: [
      {
        id: randomUUID(),
        name: 'John Doe',
        relationship: 'Spouse',
        phone: {
          number: '+15559876543',
          type: 'MOBILE',
          canReceiveSMS: true,
        },
        isPrimary: true,
      },
    ],
    employmentType: 'FULL_TIME',
    hireDate: new Date('2024-01-01'),
    role: 'CAREGIVER',
    payRate: {
      id: randomUUID(),
      rateType: 'BASE',
      amount: 20,
      unit: 'HOURLY',
      effectiveDate: new Date('2024-01-01'),
    },
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('CaregiverValidator', () => {
  describe('validateCreate', () => {
    it('succeeds when primaryBranchId is included in branchIds', () => {
      const validator = new CaregiverValidator();
      const branchId = randomUUID();
      const input = buildBaseInput({
        branchIds: [branchId],
        primaryBranchId: branchId,
      });

      const result = validator.validateCreate(input);

      expect(result.success).toBe(true);
    });

    it('fails when primaryBranchId is not included in branchIds', () => {
      const validator = new CaregiverValidator();
      const branchId = randomUUID();
      const differentPrimaryBranchId = randomUUID();
      const input = buildBaseInput({
        branchIds: [branchId],
        primaryBranchId: differentPrimaryBranchId,
      });

      const result = validator.validateCreate(input);

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual({
        field: 'primaryBranchId',
        message: 'Primary Branch ID must be included in the Branch IDs list',
      });
    });
  });
});
