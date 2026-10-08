import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useApiClient } from '@/core/hooks';
import { createEVVApiService } from '../services/evv-api';
import type { EVVSearchFilters, ClockInRequest, ClockOutRequest } from '../types';

export const useEVVApi = () => {
  const apiClient = useApiClient();
  return useMemo(() => createEVVApiService(apiClient), [apiClient]);
};

export const useEVVRecords = (filters?: EVVSearchFilters) => {
  const evvApi = useEVVApi();

  return useQuery({
    queryKey: ['evv-records', filters],
    queryFn: () => evvApi.getEVVRecords(filters),
  });
};

export const useEVVRecord = (id: string | undefined) => {
  const evvApi = useEVVApi();

  return useQuery({
    queryKey: ['evv-records', id],
    queryFn: () => evvApi.getEVVRecordById(id!),
    enabled: !!id,
  });
};

// Matches the real ClockInInput shape (visitId, caregiverId, location,
// deviceInfo) — see verticals/time-tracking-evv/src/types/evv.ts and
// evv-handlers.ts. mutate({ visitId, caregiverId, location, deviceInfo }).
export const useClockIn = () => {
  const evvApi = useEVVApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ClockInRequest) => evvApi.clockIn(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['evv-records'] });
      toast.success('Clocked in successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to clock in');
    },
  });
};

// Matches the real ClockOutInput shape (visitId, evvRecordId, caregiverId,
// location, deviceInfo). mutate({ id: evvRecordId, visitId, caregiverId,
// location, deviceInfo }) — `id` is kept as the mutation-variable name for
// backwards compatibility with existing call sites, but is mapped onto
// evvRecordId for the actual request body.
export const useClockOut = () => {
  const evvApi = useEVVApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...rest }: Omit<ClockOutRequest, 'evvRecordId'> & { id: string }) =>
      evvApi.clockOut({ ...rest, evvRecordId: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['evv-records'] });
      toast.success('Clocked out successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to clock out');
    },
  });
};
