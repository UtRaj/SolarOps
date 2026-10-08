/**
 * SolarOps REST API v1 Client
 * Strongly-typed API client interface connecting frontend to /api/v1 backend
 */

export interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
    request_id?: string;
  };
}

export interface OperationalAlert {
  id: string;
  type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  title: string;
  message: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}

export interface OutboxEvent {
  event_id: string;
  event_type: string;
  schema_version: number;
  aggregate_type: string;
  aggregate_id: string;
  timestamp: string;
  payload: Record<string, any>;
  published: boolean;
}

export interface OutboxStats {
  total_events: number;
  unpublished: number;
  published: number;
  latest_event_type: string | null;
}

export interface DlqRecord {
  dlq_id: string;
  original_event_id: string;
  event_type: string;
  failure_reason: string;
  retry_count: number;
  quarantined_at: string;
  payload: Record<string, any>;
}

export interface RedisStats {
  status: string;
  version: string;
  active_locks_count: number;
  active_locks: Record<string, { locked_by: string; acquired_at: string; ttl_sec: number }>;
  cached_keys_count: number;
  rate_limiter: { active_clients: number; blocked_requests: number };
}

export const apiClient = {
  // Health checks
  async getHealth() {
    const res = await fetch('/api/v1/health');
    return res.json();
  },

  async getReadiness() {
    const res = await fetch('/api/v1/ready');
    return res.json();
  },

  // Alerts API
  async getAlerts(status?: string): Promise<OperationalAlert[]> {
    const url = status ? `/api/v1/alerts?status=${encodeURIComponent(status)}` : '/api/v1/alerts';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch alerts');
    return res.json();
  },

  async acknowledgeAlert(alertId: string): Promise<{ success: boolean; alert: OperationalAlert }> {
    const res = await fetch(`/api/v1/alerts/${alertId}/acknowledge`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to acknowledge alert');
    return res.json();
  },

  async resolveAlert(alertId: string): Promise<{ success: boolean; alert: OperationalAlert }> {
    const res = await fetch(`/api/v1/alerts/${alertId}/resolve`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to resolve alert');
    return res.json();
  },

  // Outbox & Events API
  async getOutboxEvents(): Promise<OutboxEvent[]> {
    const res = await fetch('/api/v1/outbox/events');
    if (!res.ok) throw new Error('Failed to fetch outbox events');
    return res.json();
  },

  async getOutboxStats(): Promise<OutboxStats> {
    const res = await fetch('/api/v1/outbox/stats');
    if (!res.ok) throw new Error('Failed to fetch outbox stats');
    return res.json();
  },

  // Dead Letter Queue (DLQ) API (Phase 11)
  async getDlqRecords(): Promise<DlqRecord[]> {
    const res = await fetch('/api/v1/outbox/dlq');
    if (!res.ok) throw new Error('Failed to fetch DLQ records');
    return res.json();
  },

  async retryDlqItem(dlqId: string): Promise<{ success: boolean; retried_item: DlqRecord }> {
    const res = await fetch(`/api/v1/outbox/dlq/${dlqId}/retry`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to retry DLQ item');
    return res.json();
  },

  // Redis Cache & Locks API (Phase 8)
  async getRedisStats(): Promise<RedisStats> {
    const res = await fetch('/api/v1/redis/stats');
    if (!res.ok) throw new Error('Failed to fetch Redis stats');
    return res.json();
  },

  async acquireRedisLock(resource: string, requester: string, ttl_sec: number = 300) {
    const res = await fetch('/api/v1/redis/lock/acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource, requester, ttl_sec })
    });
    return res.json();
  },

  async releaseRedisLock(resource: string) {
    const res = await fetch('/api/v1/redis/lock/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource })
    });
    return res.json();
  },

  // Prometheus Metrics API (Phase 10)
  async getMetrics(): Promise<string> {
    const res = await fetch('/metrics');
    if (!res.ok) throw new Error('Failed to fetch metrics');
    return res.text();
  },

  // Realtime SSE Subscription (Phase 7)
  subscribeRealtimeStream(onMessage: (data: any) => void): () => void {
    if (typeof EventSource === 'undefined') return () => {};
    const eventSource = new EventSource('/api/v1/realtime/stream');
    eventSource.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        onMessage(parsed);
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };
    return () => {
      eventSource.close();
    };
  },

  // Pricing Quote API
  async calculateQuote(payload: any) {
    const res = await fetch('/api/v1/orders/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to calculate quote');
    return res.json();
  },

  // Merchant Chat API
  async sendChatMessage(message: string, activeChatOrdersCount: number) {
    const res = await fetch('/api/v1/orders/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, activeChatOrdersCount })
    });
    if (!res.ok) throw new Error('Failed to send chat message');
    return res.json();
  }
};
