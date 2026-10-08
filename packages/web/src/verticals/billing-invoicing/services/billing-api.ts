import type { ApiClient } from '@/core/services';
import type { 
  Invoice, 
  Payment,
  CreateInvoiceInput, 
  UpdateInvoiceInput,
  CreatePaymentInput,
  BillingSearchFilters, 
  InvoiceListResponse,
  BillingSummary,
  ClaimsQueueItem,
  PayorTypeFilter,
  BillingDashboardSummary,
  BatchGenerationResult,
  CMS1500ClaimForm,
} from '../types';

export interface BillingApiService {
  getInvoices(filters?: BillingSearchFilters): Promise<InvoiceListResponse>;
  getInvoiceById(id: string): Promise<Invoice>;
  createInvoice(input: CreateInvoiceInput): Promise<Invoice>;
  updateInvoice(id: string, input: UpdateInvoiceInput): Promise<Invoice>;
  deleteInvoice(id: string): Promise<void>;
  sendInvoice(id: string): Promise<Invoice>;
  voidInvoice(id: string): Promise<Invoice>;
  transitionToReadyToSubmit(id: string): Promise<Invoice>;

  getPaymentsByInvoice(invoiceId: string): Promise<Payment[]>;
  createPayment(input: CreatePaymentInput): Promise<Payment>;

  getBillingSummary(filters?: { startDate?: string; endDate?: string }): Promise<BillingSummary>;
  generateInvoicePdf(id: string): Promise<globalThis.Blob>;

  // Claims Queue & EVV Batch Actions
  getClaimsQueue(filters?: { payor?: PayorTypeFilter; search?: string }): Promise<{
    items: ClaimsQueueItem[];
    total: number;
    summary: BillingDashboardSummary;
  }>;
  generateInvoicesForVerifiedVisits(options?: { payerId?: string; billableItemIds?: string[] }): Promise<BatchGenerationResult>;
  export837P(invoiceId: string): Promise<string>;
  exportCMS1500(invoiceId: string): Promise<CMS1500ClaimForm[]>;
  exportClaimsCsv(payor?: PayorTypeFilter): Promise<string>;
}

/** Billing routes return `{ error }`; surface that text instead of the HTTP status line. */
export const billingErrorMessage = (error: unknown, fallback: string): string => {
  const serverMessage = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  if (typeof serverMessage === 'string' && serverMessage.length > 0) return serverMessage;
  return error instanceof Error && error.message ? error.message : fallback;
};

export const createBillingApiService = (apiClient: ApiClient): BillingApiService => {
  return {
    getInvoices: async (filters?: BillingSearchFilters) => {
      const params = new URLSearchParams();

      if (filters?.clientId) params.append('clientId', filters.clientId);
      if (filters?.payerId) params.append('payerId', filters.payerId);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.payerType) params.append('payerType', filters.payerType);
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);
      if (filters?.minAmount) params.append('minAmount', filters.minAmount.toString());
      if (filters?.maxAmount) params.append('maxAmount', filters.maxAmount.toString());
      if (filters?.isPastDue !== undefined) params.append('isPastDue', filters.isPastDue.toString());

      const url = `/api/billing/invoices${params.toString() ? `?${params.toString()}` : ''}`;
      return apiClient.get<InvoiceListResponse>(url);
    },

    getInvoiceById: async (id: string) => {
      return apiClient.get<Invoice>(`/api/billing/invoices/${id}`);
    },

    createInvoice: async (input: CreateInvoiceInput) => {
      return apiClient.post<Invoice>('/api/billing/invoices', input);
    },

    updateInvoice: async (id: string, input: UpdateInvoiceInput) => {
      return apiClient.patch<Invoice>(`/api/billing/invoices/${id}`, input);
    },

    deleteInvoice: async (id: string) => {
      return apiClient.delete<void>(`/api/billing/invoices/${id}`);
    },

    sendInvoice: async (id: string) => {
      return apiClient.post<Invoice>(`/api/billing/invoices/${id}/send`, {});
    },

    voidInvoice: async (id: string) => {
      return apiClient.post<Invoice>(`/api/billing/invoices/${id}/void`, {});
    },

    transitionToReadyToSubmit: async (id: string) => {
      return apiClient.post<Invoice>(`/api/billing/invoices/${id}/ready-to-submit`, {});
    },

    getPaymentsByInvoice: async (invoiceId: string) => {
      return apiClient.get<Payment[]>(`/api/billing/invoices/${invoiceId}/payments`);
    },

    createPayment: async (input: CreatePaymentInput) => {
      return apiClient.post<Payment>('/api/billing/payments', input);
    },

    getBillingSummary: async (filters?: { startDate?: string; endDate?: string }) => {
      const params = new URLSearchParams();
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);

      const url = `/api/billing/summary${params.toString() ? `?${params.toString()}` : ''}`;
      return apiClient.get<BillingSummary>(url);
    },

    generateInvoicePdf: async (id: string) => {
      const response = await fetch(`/api/billing/invoices/${id}/pdf`, {
        headers: {
          'Authorization': `Bearer ${globalThis.localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      return response.blob();
    },

    getClaimsQueue: async (filters?: { payor?: PayorTypeFilter; search?: string }) => {
      const params = new URLSearchParams();
      if (filters?.payor) params.append('payor', filters.payor);
      if (filters?.search) params.append('search', filters.search);
      const query = params.toString();
      return apiClient.get<{
        items: ClaimsQueueItem[];
        total: number;
        summary: BillingDashboardSummary;
      }>(`/api/billing/claims-queue${query ? `?${query}` : ''}`);
    },

    generateInvoicesForVerifiedVisits: async (options?: { payerId?: string; billableItemIds?: string[] }) => {
      return apiClient.post<BatchGenerationResult>('/api/billing/batch/generate-invoices', options ?? {});
    },

    export837P: async (invoiceId: string) => {
      return apiClient.get<string>(`/api/billing/invoices/${encodeURIComponent(invoiceId)}/export/837p`, {
        responseType: 'text',
      });
    },

    exportCMS1500: async (invoiceId: string) => {
      return apiClient.get<CMS1500ClaimForm[]>(
        `/api/billing/invoices/${encodeURIComponent(invoiceId)}/export/cms1500`
      );
    },

    exportClaimsCsv: async (payor?: PayorTypeFilter) => {
      const query = payor && payor !== 'ALL' ? `?payor=${payor}` : '';
      return apiClient.get<string>(`/api/billing/claims/export/csv${query}`, { responseType: 'text' });
    },
  };
};
