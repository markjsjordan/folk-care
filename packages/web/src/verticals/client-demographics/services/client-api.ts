import type { ApiClient } from '@/core/services';
import type { PaginatedResult, SearchParams } from '@/core/types';
import type { Client, CreateClientInput, UpdateClientInput, ClientSearchFilters } from '../types';

export interface DashboardClient {
  id: string;
  clientNumber: string;
  fullName: string;
  preferredName?: string;
  age: number;
  status: string;
  primaryPhone?: string | null;
  address?: {
    line1: string;
    city: string;
    state: string;
  } | null;
  alertsCount: number;
  criticalAlerts: number;
  hasCriticalRisks: boolean;
  programs: Array<{
    id: string;
    name: string;
  }>;
  nextVisit?: {
    date: Date;
    startTime: string;
  } | null;
  lastVisitDate?: Date | null;
  outstandingTasks: number;
}

export interface ClientApiService {
  getClients(filters?: ClientSearchFilters & SearchParams): Promise<PaginatedResult<Client>>;
  getClientsDashboard(filters?: ClientSearchFilters & SearchParams): Promise<PaginatedResult<DashboardClient>>;
  getClientById(id: string): Promise<Client>;
  createClient(input: CreateClientInput): Promise<Client>;
  updateClient(id: string, input: UpdateClientInput): Promise<Client>;
  deleteClient(id: string): Promise<void>;
}

export const createClientApiService = (apiClient: ApiClient): ClientApiService => {
  return {
    async getClients(filters?: ClientSearchFilters & SearchParams): Promise<PaginatedResult<Client>> {
      const params = new URLSearchParams();
      if (filters?.query) params.append('query', filters.query);
      if (filters?.status) for (const s of filters.status) params.append('status', s);
      if (filters?.city) params.append('city', filters.city);
      if (filters?.state) params.append('state', filters.state);
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.pageSize) params.append('pageSize', filters.pageSize.toString());
      if (filters?.sortBy) params.append('sortBy', filters.sortBy);
      if (filters?.sortDirection) params.append('sortDirection', filters.sortDirection);

      const queryString = params.toString();
      const response = await apiClient.get<{ success?: boolean; data?: PaginatedResult<Client> } | PaginatedResult<Client>>(
        `/api/clients${queryString ? `?${queryString}` : ''}`
      );
      return (response && typeof response === 'object' && 'data' in response && response.data)
        ? response.data
        : (response as PaginatedResult<Client>);
    },

    async getClientsDashboard(filters?: ClientSearchFilters & SearchParams): Promise<PaginatedResult<DashboardClient>> {
      const params = new URLSearchParams();
      if (filters?.query) params.append('q', filters.query);
      if (filters?.status) for (const s of filters.status) params.append('status', s);
      if (filters?.city) params.append('city', filters.city);
      if (filters?.state) params.append('state', filters.state);
      if (filters?.page) params.append('page', filters.page.toString());
      if (filters?.pageSize) params.append('limit', filters.pageSize.toString());

      const queryString = params.toString();
      const response = await apiClient.get<{ success?: boolean; data?: PaginatedResult<DashboardClient> } | PaginatedResult<DashboardClient>>(
        `/api/clients/dashboard${queryString ? `?${queryString}` : ''}`
      );
      return (response && typeof response === 'object' && 'data' in response && response.data)
        ? response.data
        : (response as PaginatedResult<DashboardClient>);
    },

    async getClientById(id: string): Promise<Client> {
      const response = await apiClient.get<{ success?: boolean; data?: Client } | Client>(`/api/clients/${id}`);
      return (response && typeof response === 'object' && 'data' in response && response.data)
        ? response.data
        : (response as Client);
    },

    async createClient(input: CreateClientInput): Promise<Client> {
      const response = await apiClient.post<{ success?: boolean; data?: Client } | Client>('/api/clients', input);
      return (response && typeof response === 'object' && 'data' in response && response.data)
        ? response.data
        : (response as Client);
    },

    async updateClient(id: string, input: UpdateClientInput): Promise<Client> {
      const response = await apiClient.patch<{ success?: boolean; data?: Client } | Client>(`/api/clients/${id}`, input);
      return (response && typeof response === 'object' && 'data' in response && response.data)
        ? response.data
        : (response as Client);
    },

    async deleteClient(id: string): Promise<void> {
      return apiClient.delete<void>(`/api/clients/${id}`);
    },
  };
};
