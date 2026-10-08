import type { ApiClient } from '@/core/services';
import type { Visit, VisitSearchFilters } from '../types';

export interface VisitApiResponse {
  success: boolean;
  data: Visit[];
  meta: {
    startDate: string;
    endDate: string;
    count: number;
  };
}

export interface CaregiverAvailability {
  caregiver_id: string;
  first_name: string;
  last_name: string;
  caregiver_status: string;
  visits: Array<{
    id: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    status: string;
    client_name: string;
  }>;
}

export interface ConflictCheckResult {
  hasConflicts: boolean;
  conflicts: Array<{
    id: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    status: string;
    client_first_name: string;
    client_last_name: string;
    address: unknown;
  }>;
}

export interface VisitApiService {
  getMyVisits(startDate: Date, endDate: Date): Promise<Visit[]>;
  getVisitsByFilters(filters: VisitSearchFilters): Promise<Visit[]>;
  getCalendarVisits(startDate: Date, endDate: Date, branchIds?: string[]): Promise<Visit[]>;
  assignCaregiver(visitId: string, caregiverId: string, checkConflicts?: boolean): Promise<Visit>;
  checkConflicts(visitId: string, caregiverId: string): Promise<ConflictCheckResult>;
  getCaregiverAvailability(date: Date, branchIds?: string[]): Promise<CaregiverAvailability[]>;
  getVisitById(visitId: string): Promise<Visit>;
  createPattern(data: CreatePatternPayload): Promise<{ pattern: any; visits: Visit[]; generatedVisitsCount: number; exceptions: any[] }>;
  getPattern(id: string): Promise<PatternDetailsResponse>;
  updatePattern(id: string, data: UpdatePatternPayload): Promise<any>;
  listPatterns(clientId?: string): Promise<any[]>;
}

export interface CreatePatternPayload {
  clientId: string;
  caregiverId?: string;
  serviceTypeId: string;
  serviceTypeName?: string;
  frequency?: string;
  rrule?: string;
  startDate: string;
  endDate?: string;
  dayOfWeek?: string[];
  startTime: string;
  duration: number;
  status?: string;
  notes?: string;
  skipHolidays?: boolean;
  horizonDays?: number;
}

export interface UpdatePatternPayload {
  updateMode: 'THIS_VISIT' | 'ALL_FUTURE';
  targetVisitId?: string;
  fromDate?: string;
  updates?: {
    caregiverId?: string | null;
    startTime?: string;
    duration?: number;
    notes?: string;
    status?: string;
    dayOfWeek?: string[];
    scheduledDate?: string;
  };
}

export interface PatternDetailsResponse {
  pattern: any;
  visits: Visit[];
  totalVisits: number;
}

export const createVisitApiService = (apiClient: ApiClient): VisitApiService => {
  return {
    async getMyVisits(startDate: Date, endDate: Date): Promise<Visit[]> {
      const params = new URLSearchParams();
      params.append('start_date', startDate.toISOString().split('T')[0]!); // YYYY-MM-DD
      params.append('end_date', endDate.toISOString().split('T')[0]!); // YYYY-MM-DD

      const response = await apiClient.get<VisitApiResponse>(
        `/api/visits/my-visits?${params.toString()}`
      );

      return response.data;
    },

    async getVisitsByFilters(filters: VisitSearchFilters): Promise<Visit[]> {
      // Use calendar endpoint to show all visits (not just caregiver's visits)
      // This allows coordinators and admins to see all organizational visits
      const startDate = filters.dateFrom ?? new Date();
      const endDate = filters.dateTo ?? new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days ahead

      return this.getCalendarVisits(startDate, endDate, filters.branchIds);
    },

    async getCalendarVisits(startDate: Date, endDate: Date, branchIds?: string[]): Promise<Visit[]> {
      const params = new URLSearchParams();
      params.append('start_date', startDate.toISOString().split('T')[0]!); // YYYY-MM-DD
      params.append('end_date', endDate.toISOString().split('T')[0]!); // YYYY-MM-DD

      if (branchIds != null && branchIds.length > 0) {
        params.append('branch_ids', branchIds.join(','));
      }

      const response = await apiClient.get<VisitApiResponse>(
        `/api/visits/calendar?${params.toString()}`
      );

      return response.data;
    },

    async assignCaregiver(visitId: string, caregiverId: string, checkConflicts = true): Promise<Visit> {
      const response = await apiClient.put<{ success: boolean; data: Visit }>(
        `/api/visits/${visitId}/assign`,
        { caregiverId, checkConflicts }
      );

      return response.data;
    },

    async checkConflicts(visitId: string, caregiverId: string): Promise<ConflictCheckResult> {
      const response = await apiClient.post<{ success: boolean } & ConflictCheckResult>(
        `/api/visits/${visitId}/check-conflicts`,
        { caregiverId }
      );

      return {
        hasConflicts: response.hasConflicts,
        conflicts: response.conflicts,
      };
    },

    async getCaregiverAvailability(date: Date, branchIds?: string[]): Promise<CaregiverAvailability[]> {
      const params = new URLSearchParams();
      params.append('date', date.toISOString().split('T')[0]!); // YYYY-MM-DD

      if (branchIds != null && branchIds.length > 0) {
        params.append('branch_ids', branchIds.join(','));
      }

      const response = await apiClient.get<{ success: boolean; data: CaregiverAvailability[] }>(
        `/api/visits/caregivers/availability?${params.toString()}`
      );

      return response.data;
    },

    async getVisitById(visitId: string): Promise<Visit> {
      const response = await apiClient.get<{ success: boolean; data: Visit }>(
        `/api/visits/${visitId}`
      );
      return response.data;
    },

    async createPattern(data: CreatePatternPayload): Promise<{ pattern: any; visits: Visit[]; generatedVisitsCount: number; exceptions: any[] }> {
      const response = await apiClient.post<{ success: boolean; data: any }>(
        '/api/visits/patterns',
        data
      );
      return response.data;
    },

    async getPattern(id: string): Promise<PatternDetailsResponse> {
      const response = await apiClient.get<{ success: boolean; data: PatternDetailsResponse }>(
        `/api/visits/patterns/${id}`
      );
      return response.data;
    },

    async updatePattern(id: string, data: UpdatePatternPayload): Promise<any> {
      const response = await apiClient.put<{ success: boolean; data: any }>(
        `/api/visits/patterns/${id}`,
        data
      );
      return response.data;
    },

    async listPatterns(clientId?: string): Promise<any[]> {
      const params = new URLSearchParams();
      if (clientId) params.append('client_id', clientId);
      const url = `/api/visits/patterns${params.toString() ? '?' + params.toString() : ''}`;
      const response = await apiClient.get<{ success: boolean; data: any[] }>(url);
      return response.data;
    },
  };
};
