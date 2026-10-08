import { useQuery } from '@tanstack/react-query';
import { apiClient, OutboxEvent, OutboxStats } from '../../api/client';

export function useOutbox() {
  const eventsQuery = useQuery<OutboxEvent[]>({
    queryKey: ['outbox-events'],
    queryFn: () => apiClient.getOutboxEvents(),
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const statsQuery = useQuery<OutboxStats>({
    queryKey: ['outbox-stats'],
    queryFn: () => apiClient.getOutboxStats(),
    refetchInterval: 5000,
    staleTime: 3000,
  });

  return {
    events: eventsQuery.data || [],
    stats: statsQuery.data || { total_events: 0, unpublished: 0, published: 0, latest_event_type: null },
    isLoading: eventsQuery.isLoading || statsQuery.isLoading,
    refetch: () => {
      eventsQuery.refetch();
      statsQuery.refetch();
    }
  };
}
