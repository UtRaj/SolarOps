import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, OperationalAlert } from '../../api/client';

export function useAlerts(statusFilter?: string) {
  const queryClient = useQueryClient();

  const alertsQuery = useQuery<OperationalAlert[]>({
    queryKey: ['alerts', statusFilter],
    queryFn: () => apiClient.getAlerts(statusFilter),
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (alertId: string) => apiClient.acknowledgeAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    }
  });

  const resolveMutation = useMutation({
    mutationFn: (alertId: string) => apiClient.resolveAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    }
  });

  return {
    alerts: alertsQuery.data || [],
    isLoading: alertsQuery.isLoading,
    isError: alertsQuery.isError,
    acknowledgeAlert: acknowledgeMutation.mutate,
    resolveAlert: resolveMutation.mutate,
    refetch: alertsQuery.refetch
  };
}
