/**
 * Create Caregiver Page
 *
 * Builds a complete CreateCaregiverInput payload (organizationId, branchIds,
 * primaryBranchId, dateOfBirth, hireDate, payRate.effectiveDate,
 * primaryAddress, emergencyContacts, etc.) so POST /api/caregivers never hits
 * the backend's unconditional `new Date(req.body.dateOfBirth)` /
 * `req.body.payRate.effectiveDate` crash path (packages/app/src/routes/caregivers.ts).
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button } from '@/core/components';
import { useAuth } from '@/core/hooks';
import { CaregiverForm, EMPTY_CAREGIVER_FORM } from '../components/CaregiverForm.js';
import type { CaregiverFormValues } from '../components/CaregiverForm.js';
import { useCaregiverApi } from '../hooks/index.js';
import type { Caregiver } from '../types/index.js';

function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const withResponse = error as Error & { response?: { data?: { error?: string; message?: string } } };
    const apiMessage = withResponse.response?.data?.error ?? withResponse.response?.data?.message;
    if (apiMessage) return apiMessage;
    if (error.message) return error.message;
  }
  return fallback;
}

function parseBranchIds(raw: string): string[] {
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function validate(values: CaregiverFormValues): Partial<Record<keyof CaregiverFormValues, string>> {
  const errors: Partial<Record<keyof CaregiverFormValues, string>> = {};

  if (!values.firstName.trim()) errors.firstName = 'First name is required';
  if (!values.lastName.trim()) errors.lastName = 'Last name is required';
  if (!values.email.trim()) errors.email = 'Email is required';
  if (!values.phoneNumber.trim()) errors.phoneNumber = 'Phone number is required';
  if (!values.dateOfBirth) errors.dateOfBirth = 'Date of birth is required';
  if (!values.hireDate) errors.hireDate = 'Hire date is required';
  if (!values.addressLine1.trim()) errors.addressLine1 = 'Street address is required';
  if (!values.addressCity.trim()) errors.addressCity = 'City is required';
  if (values.addressState.trim().length !== 2) errors.addressState = 'State must be 2 letters';
  if (!/^\d{5}(-\d{4})?$/.test(values.addressPostalCode.trim())) {
    errors.addressPostalCode = 'ZIP code must be 5 digits';
  }
  if (!values.emergencyContactName.trim()) errors.emergencyContactName = 'Required';
  if (!values.emergencyContactRelationship.trim()) errors.emergencyContactRelationship = 'Required';
  if (!values.emergencyContactPhone.trim()) errors.emergencyContactPhone = 'Required';
  if (parseBranchIds(values.branchIdsRaw).length === 0) {
    errors.branchIdsRaw = 'At least one branch ID is required';
  }
  if (!values.primaryBranchId.trim()) errors.primaryBranchId = 'Primary branch ID is required';
  if (!values.payRateAmount || Number(values.payRateAmount) <= 0) {
    errors.payRateAmount = 'Pay rate amount must be greater than 0';
  }
  if (!values.payRateEffectiveDate) {
    errors.payRateEffectiveDate = 'Pay rate effective date is required';
  }

  return errors;
}

function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function toCreatePayload(values: CaregiverFormValues, organizationId: string): Record<string, unknown> {
  const parsedBranchIds = parseBranchIds(values.branchIdsRaw);
  const primaryBranchId = values.primaryBranchId.trim();
  // Guarantee the submitted payload can never violate the DB's
  // CHECK(primary_branch_id = ANY(branch_ids)) constraint: if the user
  // didn't duplicate the primary branch into the branch list, do it for them.
  const branchIds = primaryBranchId && !parsedBranchIds.includes(primaryBranchId)
    ? [...parsedBranchIds, primaryBranchId]
    : parsedBranchIds;

  return {
    organizationId,
    branchIds,
    primaryBranchId,
    firstName: values.firstName.trim(),
    middleName: values.middleName.trim() || undefined,
    lastName: values.lastName.trim(),
    preferredName: values.preferredName.trim() || undefined,
    // dateOfBirth / hireDate / payRate.effectiveDate are ALWAYS populated here —
    // this is the fix for the backend's unconditional `new Date(...)` crash risk.
    dateOfBirth: values.dateOfBirth,
    email: values.email.trim(),
    primaryPhone: {
      number: normalizePhoneDigits(values.phoneNumber),
      type: values.phoneType,
      canReceiveSMS: values.phoneType === 'MOBILE',
      isPrimary: true,
    },
    primaryAddress: {
      type: 'HOME',
      line1: values.addressLine1.trim(),
      line2: values.addressLine2.trim() || undefined,
      city: values.addressCity.trim(),
      state: values.addressState.trim().toUpperCase(),
      postalCode: values.addressPostalCode.trim(),
      country: 'US',
    },
    emergencyContacts: [
      {
        id: crypto.randomUUID(),
        name: values.emergencyContactName.trim(),
        relationship: values.emergencyContactRelationship.trim(),
        phone: {
          number: normalizePhoneDigits(values.emergencyContactPhone),
          type: 'MOBILE',
          canReceiveSMS: true,
        },
        isPrimary: true,
      },
    ],
    employmentType: values.employmentType,
    hireDate: values.hireDate,
    role: values.role,
    payRate: {
      id: crypto.randomUUID(),
      rateType: 'BASE',
      amount: Number(values.payRateAmount),
      unit: values.payRateUnit,
      effectiveDate: values.payRateEffectiveDate,
    },
    status: values.status || undefined,
  };
}

export const CreateCaregiverPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const caregiverApi = useCaregiverApi();
  const [values, setValues] = useState<CaregiverFormValues>(EMPTY_CAREGIVER_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof CaregiverFormValues, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.organizationId) {
      toast.error('Unable to determine your organization. Please log in again.');
      return;
    }

    const validationErrors = validate(values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      toast.error('Please fix the highlighted fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = toCreatePayload(values, user.organizationId);
      const created = await caregiverApi.createCaregiver(payload as unknown as Partial<Caregiver>);
      toast.success('Caregiver created successfully');
      navigate(`/caregivers/${created.id}`);
    } catch (error) {
      // Surface the real API error (e.g. Zod validation messages from the
      // backend) instead of alert() or silently succeeding.
      toast.error(extractApiErrorMessage(error, 'Failed to create caregiver'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Add Caregiver</h1>
        <p className="text-gray-600 mt-1">Create a new caregiver record</p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="bg-white rounded-lg shadow p-6 space-y-6">
        <CaregiverForm
          values={values}
          onChange={setValues}
          errors={errors}
          disabled={isSubmitting}
        />

        <div className="flex gap-3 pt-4 border-t border-gray-100">
          <Button type="submit" isLoading={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Caregiver'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/caregivers')}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};
