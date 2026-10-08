import type { ApiClient } from '@/core/services';
import type {
  EVVRecord,
  EVVSearchFilters,
  EVVListResponse,
  ClockInRequest,
  ClockOutRequest,
  ClockInResponse,
  ClockOutResponse,
} from '../types';

export interface EVVApiService {
  getEVVRecords(filters?: EVVSearchFilters): Promise<EVVListResponse>;
  getEVVRecordById(id: string): Promise<EVVRecord>;
  clockIn(data: ClockInRequest): Promise<ClockInResponse>;
  clockOut(data: ClockOutRequest): Promise<ClockOutResponse>;
}

export const createEVVApiService = (apiClient: ApiClient): EVVApiService => {
  return {
    getEVVRecords: async (filters?: EVVSearchFilters) => {
      const queryParams = new URLSearchParams();

      if (filters?.caregiverId) queryParams.append('caregiverId', filters.caregiverId);
      if (filters?.clientId) queryParams.append('clientId', filters.clientId);
      if (filters?.status) queryParams.append('status', filters.status);
      if (filters?.startDate) queryParams.append('startDate', filters.startDate);
      if (filters?.endDate) queryParams.append('endDate', filters.endDate);
      if (filters?.verificationLevel) queryParams.append('verificationLevel', filters.verificationLevel);

      const url = `/api/evv${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      return apiClient.get<EVVListResponse>(url);
    },

    getEVVRecordById: async (id: string) => {
      return apiClient.get<EVVRecord>(`/api/evv/${id}`);
    },

    // Matches the real backend route/shape: POST /api/evv/clock-in with the
    // full ClockInInput body (visitId, caregiverId, location, deviceInfo) —
    // see verticals/time-tracking-evv/src/api/evv-handlers.ts.
    clockIn: async (data: ClockInRequest) => {
      return apiClient.post<ClockInResponse>('/api/evv/clock-in', data);
    },

    // Matches the real backend route: POST /api/evv/:id/clock-out, where
    // :id is the evvRecordId and the body still carries visitId/caregiverId/
    // location/deviceInfo per ClockOutInput.
    clockOut: async (data: ClockOutRequest) => {
      return apiClient.post<ClockOutResponse>(`/api/evv/${data.evvRecordId}/clock-out`, data);
    },
  };
};
