import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useApiClient } from '@/core/hooks';
import { createBillingApiService, billingErrorMessage } from '../services/billing-api';
import type { 
  BillingSearchFilters, 
  CreateInvoiceInput, 
  UpdateInvoiceInput, 
  CreatePaymentInput,
  PayorTypeFilter,
} from '../types';

export const useBillingApi = () => {
  const apiClient = useApiClient();
  return useMemo(() => createBillingApiService(apiClient), [apiClient]);
};

export const useInvoices = (filters?: BillingSearchFilters) => {
  const billingApi = useBillingApi();

  return useQuery({
    queryKey: ['invoices', filters],
    queryFn: () => billingApi.getInvoices(filters),
  });
};

export const useInvoice = (id: string | undefined) => {
  const billingApi = useBillingApi();

  return useQuery({
    queryKey: ['invoices', id],
    queryFn: () => billingApi.getInvoiceById(id!),
    enabled: !!id,
  });
};

export const useBillingSummary = (filters?: { startDate?: string; endDate?: string }) => {
  const billingApi = useBillingApi();

  return useQuery({
    queryKey: ['billing-summary', filters],
    queryFn: () => billingApi.getBillingSummary(filters),
  });
};

export const useClaimsQueue = (filters?: { payor?: PayorTypeFilter; search?: string }) => {
  const billingApi = useBillingApi();

  return useQuery({
    queryKey: ['claims-queue', filters],
    queryFn: () => billingApi.getClaimsQueue(filters),
  });
};

export const useInvoicePayments = (invoiceId: string | undefined) => {
  const billingApi = useBillingApi();

  return useQuery({
    queryKey: ['payments', 'invoice', invoiceId],
    queryFn: () => billingApi.getPaymentsByInvoice(invoiceId!),
    enabled: !!invoiceId,
  });
};

export const useCreateInvoice = () => {
  const billingApi = useBillingApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateInvoiceInput) => billingApi.createInvoice(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['claims-queue'] });
      toast.success('Invoice created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create invoice');
    },
  });
};

export const useUpdateInvoice = () => {
  const billingApi = useBillingApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateInvoiceInput }) =>
      billingApi.updateInvoice(id, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', data.id] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['claims-queue'] });
      toast.success('Invoice updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update invoice');
    },
  });
};

export const useDeleteInvoice = () => {
  const billingApi = useBillingApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => billingApi.deleteInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['claims-queue'] });
      toast.success('Invoice deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete invoice');
    },
  });
};

export const useSendInvoice = () => {
  const billingApi = useBillingApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => billingApi.sendInvoice(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', data.id] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['claims-queue'] });
      toast.success('Invoice sent successfully');
    },
    onError: (error: Error) => {
      toast.error(billingErrorMessage(error, 'Failed to send invoice'));
    },
  });
};

export const useTransitionToReadyToSubmit = () => {
  const billingApi = useBillingApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) => billingApi.transitionToReadyToSubmit(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', data.id] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['claims-queue'] });
      toast.success('EVV verified: Transitioned to READY_TO_SUBMIT');
    },
    onError: (error: Error) => {
      toast.error(billingErrorMessage(error, 'EVV gate rejected: a visit lacks verified EVV data'));
    },
  });
};

export const useGenerateInvoicesForVerifiedVisits = () => {
  const billingApi = useBillingApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options?: { payerId?: string; billableItemIds?: string[] }) =>
      billingApi.generateInvoicesForVerifiedVisits(options),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['claims-queue'] });

      if (data.verifiedVisitsCount > 0) {
        toast.success(
          `Generated ${data.generatedInvoices.length} invoices for ${data.verifiedVisitsCount} EVV-verified visits.` +
          (data.blockedVisitsCount > 0 ? ` (${data.blockedVisitsCount} unverified visits blocked)` : '')
        );
      } else {
        toast.error(
          data.blockedVisitsCount > 0
            ? `No verified visits to invoice. ${data.blockedVisitsCount} visit(s) blocked due to incomplete EVV.`
            : 'No visits are ready to invoice.'
        );
      }
    },
    onError: (error: Error) => {
      toast.error(billingErrorMessage(error, 'Failed to generate batch invoices'));
    },
  });
};

export const useVoidInvoice = () => {
  const billingApi = useBillingApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => billingApi.voidInvoice(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', data.id] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['claims-queue'] });
      toast.success('Invoice voided successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to void invoice');
    },
  });
};

export const useCreatePayment = () => {
  const billingApi = useBillingApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePaymentInput) => billingApi.createPayment(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', data.invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      queryClient.invalidateQueries({ queryKey: ['claims-queue'] });
      toast.success('Payment recorded successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to record payment');
    },
  });
};

export const useDownloadInvoicePdf = () => {
  const billingApi = useBillingApi();

  return useMutation({
    mutationFn: async (id: string) => {
      const blob = await billingApi.generateInvoicePdf(id);
      const sanitizedId = id.replace(/[^\w-]/g, '');

      // Create object URL and download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${sanitizedId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast.success('Invoice PDF downloaded');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to download invoice');
    },
  });
};
