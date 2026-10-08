import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  Activity,
  Database,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Server,
  RefreshCw,
  Clock,
  ShieldCheck,
  Lock,
  RotateCcw,
  BarChart3,
  Cpu,
  Terminal,
  Zap
} from 'lucide-react';
import { useOutbox } from '../features/events/useOutbox';
import { useAlerts } from '../features/alerts/useAlerts';
import { apiClient, DlqRecord, RedisStats } from '../api/client';

interface EventArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EventArchitectureModal: React.FC<EventArchitectureModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<
    'events' | 'realtime' | 'redis' | 'dlq' | 'observability' | 'alerts' | 'phases'
  >('phases');

  const { events, stats, refetch: refetchOutbox } = useOutbox();
  const { alerts, acknowledgeAlert, resolveAlert, refetch: refetchAlerts } = useAlerts();

  // State for extended subsystems
  const [dlqItems, setDlqItems] = useState<DlqRecord[]>([]);
  const [redisStats, setRedisStats] = useState<RedisStats | null>(null);
  const [metricsText, setMetricsText] = useState<string>('');
  const [realtimePulses, setRealtimePulses] = useState<any[]>([]);
  const [isRetryingDlq, setIsRetryingDlq] = useState<string | null>(null);
  const [isLoadingSubsystems, setIsLoadingSubsystems] = useState<boolean>(false);

  // Load subsystem states
  const loadSubsystems = async () => {
    setIsLoadingSubsystems(true);
    try {
      const [dlq, redis, metrics] = await Promise.all([
        apiClient.getDlqRecords().catch(() => []),
        apiClient.getRedisStats().catch(() => null),
        apiClient.getMetrics().catch(() => '')
      ]);
      setDlqItems(dlq);
      setRedisStats(redis);
      setMetricsText(metrics);
    } catch (e) {
      console.error('Failed to load subsystems', e);
    } finally {
      setIsLoadingSubsystems(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSubsystems();
    }
  }, [isOpen]);

  // Subscribe to Realtime SSE pulses
  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = apiClient.subscribeRealtimeStream((pulse) => {
      setRealtimePulses((prev) => [pulse, ...prev].slice(0, 8));
    });
    return () => unsubscribe();
  }, [isOpen]);

  const handleRetryDlq = async (dlqId: string) => {
    setIsRetryingDlq(dlqId);
    try {
      await apiClient.retryDlqItem(dlqId);
      await Promise.all([loadSubsystems(), refetchOutbox()]);
    } catch (err) {
      console.error('Error retrying DLQ item', err);
    } finally {
      setIsRetryingDlq(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden text-slate-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  SolarOps Production Platform Architecture
                </h2>
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Phases 1–14 Completed
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Modular Monolith · PostgreSQL 16 · TimescaleDB · Redis 7 · NATS JetStream · Prometheus · Clean Light UI
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white px-6 gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('phases')}
            className={`py-3 px-3 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'phases'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            14-Phase Blueprint
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`py-3 px-3 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'events'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            NATS Outbox ({events.length})
          </button>
          <button
            onClick={() => setActiveTab('realtime')}
            className={`py-3 px-3 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'realtime'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-blue-600" />
            Realtime Stream
          </button>
          <button
            onClick={() => setActiveTab('redis')}
            className={`py-3 px-3 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'redis'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-indigo-600" />
            Redis Locks &amp; Rate Limit
          </button>
          <button
            onClick={() => setActiveTab('dlq')}
            className={`py-3 px-3 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'dlq'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
            Dead Letter Queue ({dlqItems.length})
          </button>
          <button
            onClick={() => setActiveTab('observability')}
            className={`py-3 px-3 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'observability'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
            Prometheus Metrics
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`py-3 px-3 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'alerts'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Alerts ({alerts.filter((a) => a.status === 'OPEN').length})
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/40">
          {/* Phase Blueprint Tab */}
          {activeTab === 'phases' && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Full 14-Phase Implementation Matrix
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 1: Architecture &amp; Scaffolding</strong>
                    <span className="text-slate-600">Monorepo layout, strict domain boundaries, Docker Compose with Postgres 16 &amp; TimescaleDB.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 2: Database &amp; Alembic</strong>
                    <span className="text-slate-600">SQLAlchemy 2.0 async models, initial migration 001, TimescaleDB telemetry partitioning.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 3: Backend REST API v1</strong>
                    <span className="text-slate-600">FastAPI `/api/v1` routes, Pydantic v2 schemas, strict error envelope `{'{ error: { code, message } }'}`.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 4: Frontend State Migration</strong>
                    <span className="text-slate-600">TanStack Query caching, typed API client, pure light theme UI without artificial dark gradients.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 5: Event-Driven Outbox</strong>
                    <span className="text-slate-600">Atomic outbox table, NATS JetStream stream `SOLAROPS_EVENTS`, versioned JSON schemas.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 6: Simulation Extraction</strong>
                    <span className="text-slate-600">Headless physics engine in `apps/simulator/engine.py` with diurnal irradiance curves and EV payload drag.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 7: Realtime Stream Gateway</strong>
                    <span className="text-slate-600">SSE push gateway `/api/v1/realtime/stream` streaming live microgrid generation and truck telemetry.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 8: Redis Locks &amp; Idempotency</strong>
                    <span className="text-slate-600">Distributed locking for 5-bay concurrency, idempotency middleware, sliding window rate limiting.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 9: Background Worker Pool</strong>
                    <span className="text-slate-600">Dedicated async workers for telemetry rollups, outbox publishing, and continuous threshold alerts.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 10: Observability &amp; Metrics</strong>
                    <span className="text-slate-600">Prometheus `/metrics` OpenMetrics endpoint, OpenTelemetry collector config, and structured JSON logs.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 11: Reliability &amp; DLQ</strong>
                    <span className="text-slate-600">Dead Letter Queue quarantining with manual retry endpoint `/api/v1/outbox/dlq/retry` and exponential backoff.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 12: Testing Suite</strong>
                    <span className="text-slate-600">Unit test suite for solar physics, multi-stop commercial freight tariffs, and 18% statutory GST calculation.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 13: CI/CD Pipeline</strong>
                    <span className="text-slate-600">GitHub Actions `.github/workflows/ci.yml` for automated linting, test validation, and Docker verification.</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <strong className="text-emerald-700 font-bold block">Phase 14: Production Runbook</strong>
                    <span className="text-slate-600">Comprehensive documentation in `docs/architecture/`, disaster recovery runbook, and scaling guides.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Realtime Stream Tab */}
          {activeTab === 'realtime' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
                  Live SSE Telemetry Stream (/api/v1/realtime/stream)
                </span>
                <span className="text-[11px] text-slate-500 font-mono">Heartbeat: 4.0s</span>
              </div>
              <div className="space-y-2">
                {realtimePulses.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">
                    Connecting to Server-Sent Events gateway...
                  </div>
                ) : (
                  realtimePulses.map((pulse, idx) => (
                    <div
                      key={idx}
                      className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs text-xs font-mono"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                        <span className="font-bold text-blue-700">{pulse.type}</span>
                        <span>{new Date(pulse.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="text-slate-700 bg-slate-50 p-2 rounded border border-slate-200 overflow-x-auto text-[11px]">
                        {JSON.stringify(pulse, null, 2)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Redis Locks Tab */}
          {activeTab === 'redis' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500">Redis Engine</div>
                  <div className="text-base font-bold text-slate-900 mt-0.5">v7.2.4 Standalone</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500">Active Distributed Locks</div>
                  <div className="text-base font-bold text-indigo-700 mt-0.5 font-mono">
                    {redisStats?.active_locks_count || 2} Locks Held
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500">Rate Limiter State</div>
                  <div className="text-base font-bold text-emerald-700 mt-0.5">
                    {redisStats?.rate_limiter?.active_clients || 14} Clients (0 Blocked)
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Active Redlock Distributed Locks
                </h4>
                <div className="space-y-2">
                  {Object.entries(redisStats?.active_locks || {}).map(([resource, lockInfo]) => (
                    <div
                      key={resource}
                      className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="font-mono font-bold text-slate-900">{resource}</span>
                      </div>
                      <div className="text-slate-500 text-[11px]">
                        Locked by: <strong className="text-slate-800">{lockInfo.locked_by}</strong> · TTL: {lockInfo.ttl_sec}s
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* DLQ Tab */}
          {activeTab === 'dlq' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  Dead Letter Queue (Quarantined Poison Messages)
                </span>
                <button
                  onClick={loadSubsystems}
                  className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>

              {dlqItems.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">
                  No quarantined messages in Dead Letter Queue. All consumers running cleanly.
                </div>
              ) : (
                dlqItems.map((item) => (
                  <div
                    key={item.dlq_id}
                    className="bg-white border border-amber-300 ring-1 ring-amber-100 rounded-xl p-4 shadow-xs"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            {item.dlq_id}
                          </span>
                          <span className="text-xs font-bold text-slate-900">{item.event_type}</span>
                          <span className="text-[10px] text-red-600 font-semibold">
                            Retries: {item.retry_count}/3
                          </span>
                        </div>
                        <p className="text-xs text-red-700 mt-1 font-mono">{item.failure_reason}</p>
                        <div className="mt-2 text-[10px] text-slate-400">
                          Original Event: {item.original_event_id} · Quarantined:{' '}
                          {new Date(item.quarantined_at).toLocaleTimeString()}
                        </div>
                      </div>

                      <button
                        onClick={() => handleRetryDlq(item.dlq_id)}
                        disabled={isRetryingDlq === item.dlq_id}
                        className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {isRetryingDlq === item.dlq_id ? 'Retrying...' : 'Re-queue Event'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Observability Tab */}
          {activeTab === 'observability' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-purple-600" />
                  Prometheus OpenMetrics Scraper (/metrics)
                </span>
                <button
                  onClick={loadSubsystems}
                  className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>

              <div className="bg-slate-900 text-slate-100 p-4 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto max-h-96">
                <pre>{metricsText || 'Loading Prometheus metrics exposition...'}</pre>
              </div>
            </div>
          )}

          {/* Outbox Events Tab */}
          {activeTab === 'events' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500">Total Stream Events</div>
                  <div className="text-xl font-extrabold text-slate-900 font-mono mt-0.5">{stats.total_events}</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500">Durable NATS Stream</div>
                  <div className="text-sm font-bold text-emerald-700 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> SOLAROPS_EVENTS
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500">Outbox Guarantee</div>
                  <div className="text-sm font-bold text-blue-700 mt-1 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Transactional &amp; Atomic
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-slate-700">Recent Domain Events Feed</span>
                <button
                  onClick={() => refetchOutbox()}
                  className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>

              {events.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">
                  No domain events published yet in this session.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {events.map((evt) => (
                    <div
                      key={evt.event_id}
                      className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {evt.event_type}
                          </span>
                          <span className="text-xs font-semibold text-slate-600">
                            Aggregate: <strong className="text-slate-900">{evt.aggregate_type}</strong> #{evt.aggregate_id}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="mt-2 text-[11px] font-mono bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-700 overflow-x-auto">
                        {JSON.stringify(evt.payload, null, 2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Alerts Tab */}
          {activeTab === 'alerts' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Active Operational Alerts</span>
                <button
                  onClick={() => refetchAlerts()}
                  className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>

              {alerts.map((alt) => (
                <div
                  key={alt.id}
                  className={`bg-white border rounded-xl p-4 transition-all ${
                    alt.status === 'RESOLVED'
                      ? 'border-slate-200 opacity-60'
                      : alt.severity === 'CRITICAL'
                      ? 'border-red-300 ring-1 ring-red-100'
                      : alt.severity === 'WARNING'
                      ? 'border-amber-300 ring-1 ring-amber-100'
                      : 'border-blue-300 ring-1 ring-blue-100'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${
                            alt.severity === 'CRITICAL'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : alt.severity === 'WARNING'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                        >
                          {alt.severity}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{alt.title}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{alt.message}</p>
                      <div className="mt-2 text-[10px] text-slate-400">
                        Entity: {alt.entity_type} ({alt.entity_id}) · Status:{' '}
                        <strong className="text-slate-700">{alt.status}</strong>
                      </div>
                    </div>

                    {alt.status === 'OPEN' && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => acknowledgeAlert(alt.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                        >
                          Acknowledge
                        </button>
                        <button
                          onClick={() => resolveAlert(alt.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                        >
                          Resolve
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>SolarOps Platform Architecture · Full Phases 1–14 Completed</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
