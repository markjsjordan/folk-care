/**
 * Create Audit Page
 *
 * Form to schedule a new quality assurance audit
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  Input,
  Select,
  FormField,
  LoadingSpinner,
  ErrorMessage,
} from '@/core/components';
import { useCreateAudit } from '../hooks';
import type { CreateAuditInput } from '../types';

const auditSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  auditType: z.enum([
    'COMPLIANCE',
    'QUALITY',
    'SAFETY',
    'DOCUMENTATION',
    'FINANCIAL',
    'MEDICATION',
    'INFECTION_CONTROL',
    'TRAINING',
    'INTERNAL',
    'EXTERNAL',
  ]),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  scope: z.enum(['ORGANIZATION', 'BRANCH', 'DEPARTMENT', 'CAREGIVER', 'CLIENT', 'PROCESS']),
  scheduledStartDate: z.string().min(1, 'Scheduled start date is required'),
  scheduledEndDate: z.string().min(1, 'Scheduled end date is required'),
  leadAuditorId: z.string().min(1, 'Lead auditor is required'),
});

type AuditFormData = z.infer<typeof auditSchema>;

const auditTypeOptions = [
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'QUALITY', label: 'Quality' },
  { value: 'SAFETY', label: 'Safety' },
  { value: 'DOCUMENTATION', label: 'Documentation' },
  { value: 'FINANCIAL', label: 'Financial' },
  { value: 'MEDICATION', label: 'Medication' },
  { value: 'INFECTION_CONTROL', label: 'Infection Control' },
  { value: 'TRAINING', label: 'Training' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'EXTERNAL', label: 'External' },
];

const priorityOptions = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const scopeOptions = [
  { value: 'ORGANIZATION', label: 'Organization' },
  { value: 'BRANCH', label: 'Branch' },
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'CAREGIVER', label: 'Caregiver' },
  { value: 'CLIENT', label: 'Client' },
  { value: 'PROCESS', label: 'Process' },
];

export const CreateAuditPage: React.FC = () => {
  const navigate = useNavigate();
  const createAudit = useCreateAudit();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuditFormData>({
    resolver: zodResolver(auditSchema as any),
    defaultValues: {
      title: '',
      description: '',
      auditType: 'COMPLIANCE',
      priority: 'MEDIUM',
      scope: 'ORGANIZATION',
      scheduledStartDate: '',
      scheduledEndDate: '',
      leadAuditorId: '',
    },
  });

  const onFormSubmit = async (data: AuditFormData) => {
    const input: CreateAuditInput = { ...data };
    try {
      const newAudit = await createAudit.mutateAsync(input);
      navigate(`/quality-assurance/audits/${newAudit.id}`);
    } catch {
      // Error is handled by the mutation
    }
  };

  if (createAudit.isError) {
    return (
      <ErrorMessage
        message={(createAudit.error as Error)?.message || 'Failed to create audit'}
        retry={() => createAudit.reset()}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/quality-assurance/audits">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to Audits
          </Button>
        </Link>
      </div>

      {/* Page Title */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Schedule New Audit</h1>
        <p className="text-gray-600 mt-1">
          Create a new quality assurance audit with scope, priority, and schedule
        </p>
      </div>

      {/* Form */}
      <Card>
        <CardHeader title="Audit Details" />
        <CardContent>
          <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
            <FormField label="Title" error={errors.title?.message} required>
              <Input {...register('title')} placeholder="Enter audit title" />
            </FormField>

            <FormField label="Description" error={errors.description?.message} required>
              <textarea
                {...register('description')}
                rows={4}
                placeholder="Describe the purpose and scope of this audit"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
              />
            </FormField>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FormField label="Audit Type" error={errors.auditType?.message} required>
                <Select {...register('auditType')} options={auditTypeOptions} />
              </FormField>

              <FormField label="Priority" error={errors.priority?.message} required>
                <Select {...register('priority')} options={priorityOptions} />
              </FormField>

              <FormField label="Scope" error={errors.scope?.message} required>
                <Select {...register('scope')} options={scopeOptions} />
              </FormField>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                label="Scheduled Start Date"
                error={errors.scheduledStartDate?.message}
                required
              >
                <Input type="date" {...register('scheduledStartDate')} />
              </FormField>

              <FormField
                label="Scheduled End Date"
                error={errors.scheduledEndDate?.message}
                required
              >
                <Input type="date" {...register('scheduledEndDate')} />
              </FormField>
            </div>

            {/*
              Pending: No reusable user-picker component exists under @/core/components yet.
              Using a plain text input for the lead auditor's user ID until one is built.
            */}
            <FormField label="Lead Auditor ID" error={errors.leadAuditorId?.message} required>
              <Input {...register('leadAuditorId')} placeholder="Enter lead auditor user ID" />
            </FormField>

            <div className="flex items-center gap-3 pt-4">
              <Button type="submit" disabled={createAudit.isPending}>
                {createAudit.isPending ? 'Creating...' : 'Create Audit'}
              </Button>
              <Link to="/quality-assurance/audits">
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Loading Overlay */}
      {createAudit.isPending && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center gap-3">
            <LoadingSpinner size="lg" />
            <span className="text-lg font-medium">Creating Audit...</span>
          </div>
        </div>
      )}
    </div>
  );
};
