import { useMemo } from 'react';
import { useClients } from '@/verticals/client-demographics/hooks/useClients';
import { useDashboardStats, useComplianceAlerts } from '@/verticals/analytics-reporting/hooks/useAnalytics';

export interface OrganizationStats {
  activeClients: number;
  todayVisits: number;
  pendingTasks: number;
  alerts: number;
  isLoading: boolean;
  error: Error | null;
}

export function useOrganizationStats(): OrganizationStats {
  const todayFilter = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      dateRange: {
        startDate: today,
        endDate: tomorrow,
      },
    };
  }, []);

  const {
    data: activeClientsResult,
    isLoading: isClientsLoading,
    error: clientsError,
  } = useClients({
    status: ['ACTIVE'],
    pageSize: 1,
  });

  const {
    data: dashboardStats,
    isLoading: isStatsLoading,
    error: statsError,
  } = useDashboardStats();

  const {
    data: complianceAlerts,
    isLoading: isAlertsLoading,
    error: alertsError,
  } = useComplianceAlerts(todayFilter);

  const activeClients = activeClientsResult?.total ?? 0;
  const todayVisits = (dashboardStats?.inProgress ?? 0) + (dashboardStats?.completedToday ?? 0);
  const pendingTasks = dashboardStats?.needsReview ?? 0;
  const alerts = complianceAlerts?.length ?? 0;

  const isLoading = isClientsLoading || isStatsLoading || isAlertsLoading;
  const error = (clientsError ?? statsError ?? alertsError ?? null) as Error | null;

  return {
    activeClients,
    todayVisits,
    pendingTasks,
    alerts,
    isLoading,
    error,
  };
}
