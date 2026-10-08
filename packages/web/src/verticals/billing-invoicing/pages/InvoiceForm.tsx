/**
 * Invoice Form Page
 *
 * Form to create a new invoice or edit an existing DRAFT/PENDING_REVIEW invoice.
 */

import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
import { useInvoice, useCreateInvoice, useUpdateInvoice } from '../hooks';
import type { CreateInvoiceInput, UpdateInvoiceInput } from '../types';

const payerTypeOptions = [
  { value: 'MEDICAID', label: 'Medicaid' },
  { value: 'MEDICARE', label: 'Medicare' },
  { value: 'MEDICARE_ADVANTAGE', label: 'Medicare Advantage' },
  { value: 'PRIVATE_INSURANCE', label: 'Private Insurance' },
  { value: 'MANAGED_CARE', label: 'Managed Care' },
  { value: 'VETERANS_BENEFITS', label: 'Veterans Benefits' },
  { value: 'WORKERS_COMP', label: 'Workers Comp' },
  { value: 'PRIVATE_PAY', label: 'Private Pay' },
  { value: 'GRANT', label: 'Grant' },
  { value: 'OTHER', label: 'Other' },
];

const invoiceStatusOptions = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SENT', label: 'Sent' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'PAST_DUE', label: 'Past Due' },
  { value: 'DISPUTED', label: 'Disputed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'VOIDED', label: 'Voided' },
];

const invoiceFormSchema = z.object({
  clientId: z.string().optional(),
  payerId: z.string().min(1, 'Payer is required'),
  payerType: z.enum([
    'MEDICAID',
    'MEDICARE',
    'MEDICARE_ADVANTAGE',
    'PRIVATE_INSURANCE',
    'MANAGED_CARE',
    'VETERANS_BENEFITS',
    'WORKERS_COMP',
    'PRIVATE_PAY',
    'GRANT',
    'OTHER',
  ]),
  payerName: z.string().min(1, 'Payer name is required'),
  invoiceDate: z.string().min(1, 'Invoice date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  periodStart: z.string().min(1, 'Period start is required'),
  periodEnd: z.string().min(1, 'Period end is required'),
  billableItemIdsRaw: z.string().optional(),
  notes: z.string().optional(),
  // Edit-mode only fields (UpdateInvoiceInput)
  status: z
    .enum([
      'DRAFT',
      'PENDING_REVIEW',
      'APPROVED',
      'READY_TO_SUBMIT',
      'SENT',
      'SUBMITTED',
      'PARTIALLY_PAID',
      'PAID',
      'PAST_DUE',
      'DISPUTED',
      'CANCELLED',
      'VOIDED',
    ])
    .optional(),
  taxAmount: z.string().optional(),
  discountAmount: z.string().optional(),
});

type InvoiceFormData = z.infer<typeof invoiceFormSchema>;

/**
 * Parse a comma/newline separated string of billable item IDs into an array.
 *
 * TODO: No reusable billable-items picker component exists under
 * @/core/components yet. Using a plain textarea stopgap (comma or
 * newline separated IDs) until a real billable-items selector is built.
 */
function parseBillableItemIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export const InvoiceForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);

  const { data: existingInvoice, isLoading: isLoadingInvoice } = useInvoice(id);
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();

  const isPending = createInvoice.isPending || updateInvoice.isPending;
  const isError = createInvoice.isError || updateInvoice.isError;
  const error = createInvoice.error || updateInvoice.error;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema as any),
    defaultValues: {
      clientId: '',
      payerId: '',
      payerType: 'PRIVATE_PAY',
      payerName: '',
      invoiceDate: '',
      dueDate: '',
      periodStart: '',
      periodEnd: '',
      billableItemIdsRaw: '',
      notes: '',
      status: 'DRAFT',
      taxAmount: '',
      discountAmount: '',
    },
  });

  // Pre-populate defaultValues in edit mode once the invoice loads
  React.useEffect(() => {
    if (isEditMode && existingInvoice) {
      reset({
        clientId: existingInvoice.clientId || '',
        payerId: existingInvoice.payerId,
        payerType: existingInvoice.payerType,
        payerName: existingInvoice.payerName,
        invoiceDate: existingInvoice.invoiceDate?.slice(0, 10) || '',
        dueDate: existingInvoice.dueDate?.slice(0, 10) || '',
        periodStart: existingInvoice.periodStart?.slice(0, 10) || '',
        periodEnd: existingInvoice.periodEnd?.slice(0, 10) || '',
        billableItemIdsRaw: (existingInvoice.lineItems || [])
          .map((item) => item.billableItemId)
          .join('\n'),
        notes: existingInvoice.notes || '',
        status: existingInvoice.status,
        taxAmount: String(existingInvoice.taxAmount ?? ''),
        discountAmount: String(existingInvoice.discountAmount ?? ''),
      });
    }
  }, [isEditMode, existingInvoice, reset]);

  const onFormSubmit = async (data: InvoiceFormData) => {
    try {
      if (isEditMode && id) {
        const updateInput: UpdateInvoiceInput = {
          status: data.status,
          dueDate: data.dueDate,
          notes: data.notes,
          taxAmount: data.taxAmount ? Number(data.taxAmount) : undefined,
          discountAmount: data.discountAmount ? Number(data.discountAmount) : undefined,
        };
        const result = await updateInvoice.mutateAsync({ id, input: updateInput });
        navigate(`/billing/${result.id}`);
      } else {
        const createInput: CreateInvoiceInput = {
          clientId: data.clientId || undefined,
          payerId: data.payerId,
          payerType: data.payerType,
          payerName: data.payerName,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
          billableItemIds: parseBillableItemIds(data.billableItemIdsRaw),
          notes: data.notes || undefined,
        };
        const result = await createInvoice.mutateAsync(createInput);
        navigate(`/billing/${result.id}`);
      }
    } catch {
      // Error is handled by the mutation
    }
  };

  if (isEditMode && isLoadingInvoice) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorMessage
        message={(error as Error)?.message || 'Failed to save invoice'}
        retry={() => {
          createInvoice.reset();
          updateInvoice.reset();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to={isEditMode && id ? `/billing/${id}` : '/billing'}>
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          {isEditMode ? 'Edit Invoice' : 'New Invoice'}
        </h1>
        <p className="text-gray-600 mt-1">
          {isEditMode
            ? 'Update invoice details'
            : 'Create a new invoice for a payer'}
        </p>
      </div>

      <Card>
        <CardHeader title="Invoice Details" />
        <CardContent>
          <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField label="Client ID" error={errors.clientId?.message}>
                <Input {...register('clientId')} placeholder="Optional client ID" disabled={isEditMode} data-testid="invoice-client-id" />
              </FormField>

              <FormField label="Payer ID" error={errors.payerId?.message} required>
                <Input {...register('payerId')} placeholder="Payer ID" disabled={isEditMode} data-testid="invoice-payer-id" />
              </FormField>

              <FormField label="Payer Type" error={errors.payerType?.message} required>
                <Select {...register('payerType')} options={payerTypeOptions} disabled={isEditMode} data-testid="invoice-payer-type" />
              </FormField>

              <FormField label="Payer Name" error={errors.payerName?.message} required>
                <Input {...register('payerName')} placeholder="Payer name" disabled={isEditMode} data-testid="invoice-payer-name" />
              </FormField>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField label="Invoice Date" error={errors.invoiceDate?.message} required>
                <Input type="date" {...register('invoiceDate')} disabled={isEditMode} data-testid="invoice-date" />
              </FormField>

              <FormField label="Due Date" error={errors.dueDate?.message} required>
                <Input type="date" {...register('dueDate')} data-testid="invoice-due-date" />
              </FormField>

              <FormField label="Period Start" error={errors.periodStart?.message} required>
                <Input type="date" {...register('periodStart')} disabled={isEditMode} data-testid="invoice-period-start" />
              </FormField>

              <FormField label="Period End" error={errors.periodEnd?.message} required>
                <Input type="date" {...register('periodEnd')} disabled={isEditMode} data-testid="invoice-period-end" />
              </FormField>
            </div>

            {/*
              TODO: No reusable billable-items picker component exists under
              @/core/components yet. Using a plain textarea stopgap (comma or
              newline separated IDs) until a real billable-items selector is
              built in a follow-up.
            */}
            <FormField
              label="Billable Item IDs"
              error={errors.billableItemIdsRaw?.message}
            >
              <textarea
                {...register('billableItemIdsRaw')}
                rows={4}
                placeholder="Enter billable item IDs, one per line or comma-separated"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                disabled={isEditMode}
                data-testid="invoice-billable-item-ids"
              />
            </FormField>

            {isEditMode && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField label="Status" error={errors.status?.message}>
                  <Select {...register('status')} options={invoiceStatusOptions} data-testid="invoice-status" />
                </FormField>

                <FormField label="Tax Amount" error={errors.taxAmount?.message}>
                  <Input type="number" step="0.01" {...register('taxAmount')} data-testid="invoice-tax-amount" />
                </FormField>

                <FormField label="Discount Amount" error={errors.discountAmount?.message}>
                  <Input type="number" step="0.01" {...register('discountAmount')} data-testid="invoice-discount-amount" />
                </FormField>
              </div>
            )}

            <FormField label="Notes" error={errors.notes?.message}>
              <textarea
                {...register('notes')}
                rows={3}
                placeholder="Optional notes"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                data-testid="invoice-notes"
              />
            </FormField>

            <div className="flex items-center gap-3 pt-4">
              <Button type="submit" disabled={isPending} data-testid="invoice-submit">
                {isPending ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Invoice'}
              </Button>
              <Link to={isEditMode && id ? `/billing/${id}` : '/billing'}>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {isPending && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center gap-3">
            <LoadingSpinner size="lg" />
            <span className="text-lg font-medium">
              {isEditMode ? 'Saving Invoice...' : 'Creating Invoice...'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
