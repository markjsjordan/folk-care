import type { ApiClient } from '@/core/services';
import type {
  PayPeriod,
  PayRun,
  PayStub,
  PayPeriodListResponse,
  PayRunListResponse,
  PayStubListResponse,
  PayrollSummary,
  PayrollSearchFilters,
  PayRunSearchFilters,
  PayStubSearchFilters,
  CreatePayRunInput,
  ApprovePayRunInput,
  CreatePayPeriodInput,
} from '../types';



export interface PayrollApiService {
  getPayPeriods(filters?: PayrollSearchFilters): Promise<PayPeriodListResponse>;
  getPayPeriodById(id: string): Promise<PayPeriod>;
  createPayPeriod(input: CreatePayPeriodInput): Promise<PayPeriod>;
  openPayPeriod(id: string): Promise<void>;
  lockPayPeriod(id: string): Promise<void>;
  unlockPayPeriod(id: string): Promise<void>;
  getPayRuns(filters?: PayRunSearchFilters): Promise<PayRunListResponse>;
  getPayRunById(id: string): Promise<PayRun>;
  createPayRun(input: CreatePayRunInput): Promise<PayRun>;
  calculatePayRun(id: string): Promise<PayRun>;
  approvePayRun(id: string, input?: ApprovePayRunInput): Promise<PayRun>;
  processPayRun(id: string): Promise<PayRun>;
  getPayStubs(filters?: PayStubSearchFilters): Promise<PayStubListResponse>;
  getPayStubById(id: string): Promise<PayStub>;
  downloadPayStubPdf(id: string): Promise<globalThis.Blob>;
  getPayrollSummary(): Promise<PayrollSummary>;
}

export const createPayrollApiService = (apiClient: ApiClient): PayrollApiService => {
  return {
    getPayPeriods: async (filters?: PayrollSearchFilters) => {
      const params = new URLSearchParams();

      if (filters?.periodType) params.append('periodType', filters.periodType);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.year) params.append('year', filters.year.toString());
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);

      const url = `/api/payroll/periods${params.toString() ? `?${params.toString()}` : ''}`;
      // Backend returns { data: PayPeriod[], meta: { total, limit, offset } },
      // not the { items, total, hasMore } shape PayPeriodListResponse expects.
      const response = await apiClient.get<{ data: PayPeriod[]; meta?: { total: number; limit: number; offset: number } }>(url);
      const items = response.data ?? [];
      const total = response.meta?.total ?? items.length;
      const limit = response.meta?.limit ?? items.length;
      const offset = response.meta?.offset ?? 0;
      return { items, total, hasMore: offset + items.length < total || items.length >= limit };
    },

    getPayPeriodById: async (id: string) => {
      return apiClient.get<PayPeriod>(`/api/payroll/periods/${id}`);
    },

    createPayPeriod: async (input: CreatePayPeriodInput) => {
      const response = await apiClient.post<{ data: PayPeriod }>('/api/payroll/periods', input);
      return response.data;
    },

    openPayPeriod: async (id: string) => {
      await apiClient.post<{ success: boolean }>(`/api/payroll/periods/${id}/open`, {});
    },

    lockPayPeriod: async (id: string) => {
      await apiClient.post<{ success: boolean }>(`/api/payroll/periods/${id}/lock`, {});
    },

    unlockPayPeriod: async (id: string) => {
      await apiClient.post<{ success: boolean }>(`/api/payroll/periods/${id}/unlock`, {});
    },

    getPayRuns: async (filters?: PayRunSearchFilters) => {
      const params = new URLSearchParams();

      if (filters?.payPeriodId) params.append('payPeriodId', filters.payPeriodId);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);

      const url = `/api/payroll/pay-runs${params.toString() ? `?${params.toString()}` : ''}`;
      // Backend returns { data: PayRun[] } (no pagination envelope).
      const response = await apiClient.get<{ data: PayRun[] }>(url);
      const items = response.data ?? [];
      return { items, total: items.length, hasMore: false };
    },

    getPayRunById: async (id: string) => {
      return apiClient.get<PayRun>(`/api/payroll/pay-runs/${id}`);
    },

    createPayRun: async (input: CreatePayRunInput) => {
      return apiClient.post<PayRun>('/api/payroll/pay-runs', input);
    },

    calculatePayRun: async (id: string) => {
      return apiClient.post<PayRun>(`/api/payroll/pay-runs/${id}/calculate`, {});
    },

    approvePayRun: async (id: string, input?: ApprovePayRunInput) => {
      return apiClient.post<PayRun>(`/api/payroll/pay-runs/${id}/approve`, input || {});
    },

    processPayRun: async (id: string) => {
      return apiClient.post<PayRun>(`/api/payroll/pay-runs/${id}/process`, {});
    },

    getPayStubs: async (filters?: PayStubSearchFilters) => {
      const params = new URLSearchParams();

      if (filters?.payRunId) params.append('payRunId', filters.payRunId);
      if (filters?.payPeriodId) params.append('payPeriodId', filters.payPeriodId);
      if (filters?.caregiverId) params.append('caregiverId', filters.caregiverId);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.paymentMethod) params.append('paymentMethod', filters.paymentMethod);
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);

      const url = `/api/payroll/pay-stubs${params.toString() ? `?${params.toString()}` : ''}`;
      // Backend returns { data: PayStub[] } (no pagination envelope).
      const response = await apiClient.get<{ data: PayStub[] }>(url);
      const items = response.data ?? [];
      return { items, total: items.length, hasMore: false };
    },

    getPayStubById: async (id: string) => {
      return apiClient.get<PayStub>(`/api/payroll/pay-stubs/${id}`);
    },

    downloadPayStubPdf: async (id: string) => {
      const response = await fetch(`/api/payroll/pay-stubs/${id}/pdf`, {
        headers: {
          'Authorization': `Bearer ${globalThis.localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      return response.blob();
    },

    getPayrollSummary: async () => {
      return apiClient.get<PayrollSummary>('/api/payroll/summary');
    },
  };
};
