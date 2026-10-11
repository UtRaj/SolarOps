import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { processGenerativeAIChat, getLLMConfig, checkOllamaAvailable } from './src/server/openSourceAI';

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/metrics', async (req, res, next) => {
  if (!process.env.API_URL) return next();
  try {
    const response = await fetch(new URL('/metrics', process.env.API_URL));
    res.status(response.status).type(response.headers.get('content-type') || 'text/plain').send(await response.text());
  } catch (error) {
    console.error('Metrics API request failed:', error);
    res.status(503).type('text/plain').send('metrics temporarily unavailable');
  }
});

// Use the durable API for infrastructure-backed routes while retaining the local
// simulation handlers for development setups that do not configure API_URL.
app.use('/api/v1', async (req, res, next) => {
  const upstream = process.env.API_URL;
  const apiPath = req.originalUrl.split('?')[0].replace(/^\/api\/v1/, '');
  const shouldProxy = /^\/(health|ready|alerts(?:\/[^/]+\/(?:acknowledge|resolve))?|outbox\/(?:events|stats|dlq(?:\/[^/]+\/retry)?)|redis\/(?:stats|lock\/(?:acquire|release))|energy\/(?:grid-stations|bess|solar-farms\/\d+\/scale)|battery\/(?:packs|swap)|fleet\/(?:trucks(?:\/\d+\/dispatch)?|chargers)|delivery-points|orders)$/.test(apiPath);
  if (!upstream || !shouldProxy) return next();

  try {
    const response = await fetch(new URL(req.originalUrl, upstream), {
      method: req.method,
      headers: req.method === 'GET' ? undefined : { 'content-type': 'application/json' },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {})
    });
    const body = await response.text();
    res.status(response.status).type(response.headers.get('content-type') || 'application/json');
    if (apiPath === '/outbox/events' && response.ok) {
      const events = JSON.parse(body).map((event: any) => ({ ...event, event_id: event.event_id ?? event.id, timestamp: event.timestamp ?? event.created_at }));
      return res.send(JSON.stringify(events));
    }
    return res.send(body);
  } catch (error) {
    console.error('Durable API request failed:', error);
    return res.status(503).json({ error: { code: 'API_UNAVAILABLE', message: 'The operational API is temporarily unavailable.' } });
  }
});

// Lazy-initialize Gemini AI client (optional fallback)
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SolarOps Clean Energy & EV Fleet Platform',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SolarOps Clean Energy & EV Fleet Platform (v1 REST API)',
    architecture: 'Modular Monolith + Outbox Pattern',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/ready', (req, res) => {
  res.json({
    status: 'ready',
    database: 'healthy',
    event_bus: 'nats_jetstream_ready',
    timestamp: new Date().toISOString()
  });
});

// Transactional Outbox Store (In-Memory Audit Log for NATS JetStream)
interface OutboxRecord {
  event_id: string;
  event_type: string;
  schema_version: number;
  aggregate_type: string;
  aggregate_id: string;
  timestamp: string;
  payload: Record<string, any>;
  published: boolean;
}

const outboxRecords: OutboxRecord[] = [
  {
    event_id: 'evt-init-01',
    event_type: 'SolarGenerationUpdated',
    schema_version: 1,
    aggregate_type: 'grid_station',
    aggregate_id: 'GS-01',
    timestamp: new Date().toISOString(),
    payload: { solar_generation_kw: 1420.0, grid_export_kw: 820.0 },
    published: true
  }
];

function recordOutboxEvent(eventType: string, aggregateType: string, aggregateId: string, payload: Record<string, any>) {
  const event: OutboxRecord = {
    event_id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    event_type: eventType,
    schema_version: 1,
    aggregate_type: aggregateType,
    aggregate_id: aggregateId,
    timestamp: new Date().toISOString(),
    payload,
    published: false
  };
  outboxRecords.unshift(event);
  if (outboxRecords.length > 100) outboxRecords.pop();
  return event;
}

// Operational Alerts Store
interface AlertItem {
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

const operationalAlerts: AlertItem[] = [
  {
    id: 'ALT-101',
    type: 'THERMAL',
    severity: 'WARNING',
    status: 'OPEN',
    title: 'BESS Thermal Normalizing',
    message: 'Super Battery Core temperature at 28.4°C within active liquid cooling safety envelope.',
    entity_type: 'BESS',
    entity_id: 'BESS-01',
    created_at: new Date().toISOString()
  },
  {
    id: 'ALT-102',
    type: 'BAY_LIMIT',
    severity: 'INFO',
    status: 'OPEN',
    title: 'Fast DC Bay Limit (5 Active)',
    message: 'Active daytime bays operating under 5-bay concurrency limit. Overnight slow AC available.',
    entity_type: 'CHARGER_BAY',
    entity_id: 'BAYS-1-5',
    created_at: new Date().toISOString()
  }
];

// Alerts API
app.get('/api/v1/alerts', (req, res) => {
  const statusFilter = req.query.status as string | undefined;
  if (statusFilter) {
    return res.json(operationalAlerts.filter(a => a.status.toLowerCase() === statusFilter.toLowerCase()));
  }
  res.json(operationalAlerts);
});

app.post('/api/v1/alerts/:id/acknowledge', (req, res) => {
  const alert = operationalAlerts.find(a => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: { code: 'ALERT_NOT_FOUND', message: 'Alert not found' } });
  alert.status = 'ACKNOWLEDGED';
  recordOutboxEvent('AlertAcknowledged', 'alert', alert.id, { alert_id: alert.id });
  res.json({ success: true, alert });
});

app.post('/api/v1/alerts/:id/resolve', (req, res) => {
  const alert = operationalAlerts.find(a => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: { code: 'ALERT_NOT_FOUND', message: 'Alert not found' } });
  alert.status = 'RESOLVED';
  recordOutboxEvent('AlertResolved', 'alert', alert.id, { alert_id: alert.id });
  res.json({ success: true, alert });
});

// Outbox API
app.get('/api/v1/outbox/events', (req, res) => {
  res.json(outboxRecords);
});

app.get('/api/v1/outbox/stats', (req, res) => {
  res.json({
    total_events: outboxRecords.length,
    unpublished: outboxRecords.filter(e => !e.published).length,
    published: outboxRecords.filter(e => e.published).length,
    latest_event_type: outboxRecords[0]?.event_type || null
  });
});

// Dead Letter Queue (DLQ) Store (Phase 11)
interface DlqRecord {
  dlq_id: string;
  original_event_id: string;
  event_type: string;
  failure_reason: string;
  retry_count: number;
  quarantined_at: string;
  payload: Record<string, any>;
}

const dlqRecords: DlqRecord[] = [
  {
    dlq_id: 'dlq-001',
    original_event_id: 'evt-legacy-failed',
    event_type: 'TelemetrySyncFailed',
    failure_reason: 'Downstream consumer timeout after 3 attempts (HTTP 504)',
    retry_count: 3,
    quarantined_at: new Date(Date.now() - 3600000).toISOString(),
    payload: { sensor_id: 'bay-5-power', reported_power_kw: -12.4 }
  }
];

app.get('/api/v1/outbox/dlq', (req, res) => {
  res.json(dlqRecords);
});

app.post('/api/v1/outbox/dlq/:dlq_id/retry', (req, res) => {
  const index = dlqRecords.findIndex(d => d.dlq_id === req.params.dlq_id);
  if (index === -1) {
    return res.status(404).json({ error: { code: 'DLQ_NOT_FOUND', message: 'Message not found in DLQ' } });
  }
  const item = dlqRecords.splice(index, 1)[0];
  // Re-enqueue as published outbox event
  recordOutboxEvent(item.event_type, 'dlq_retry', item.original_event_id, item.payload);
  res.json({ success: true, message: 'Message successfully re-queued for processing', retried_item: item });
});

// Redis Cache & Distributed Lock Management (Phase 8)
const activeDistributedLocks: Record<string, { locked_by: string; acquired_at: string; ttl_sec: number }> = {
  'lock:bay:1': { locked_by: 'truck-1', acquired_at: new Date().toISOString(), ttl_sec: 300 },
  'lock:bay:3': { locked_by: 'truck-4', acquired_at: new Date().toISOString(), ttl_sec: 300 }
};

app.get('/api/v1/redis/stats', (req, res) => {
  res.json({
    status: 'connected',
    version: '7.2.4',
    active_locks_count: Object.keys(activeDistributedLocks).length,
    active_locks: activeDistributedLocks,
    cached_keys_count: 42,
    rate_limiter: { active_clients: 14, blocked_requests: 0 }
  });
});

app.post('/api/v1/redis/lock/acquire', (req, res) => {
  const { resource, requester, ttl_sec = 300 } = req.body;
  if (!resource || !requester) {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'resource and requester required' } });
  }
  if (activeDistributedLocks[resource]) {
    return res.status(409).json({ error: { code: 'LOCK_HELD', message: `Resource ${resource} is already locked by ${activeDistributedLocks[resource].locked_by}` } });
  }
  activeDistributedLocks[resource] = {
    locked_by: requester,
    acquired_at: new Date().toISOString(),
    ttl_sec
  };
  recordOutboxEvent('DistributedLockAcquired', 'redis_lock', resource, { resource, requester, ttl_sec });
  res.json({ success: true, resource, acquired: true });
});

app.post('/api/v1/redis/lock/release', (req, res) => {
  const { resource } = req.body;
  delete activeDistributedLocks[resource];
  recordOutboxEvent('DistributedLockReleased', 'redis_lock', resource, { resource });
  res.json({ success: true, resource, released: true });
});

// Chaos Engineering & Fault Injection System (Milestone 5)
interface ChaosState {
  activeFault: string | null;
  solarDropActive: boolean;
  chargerContentionActive: boolean;
  bessThermalSpikeActive: boolean;
  outboxPartitionActive: boolean;
}

const chaosState: ChaosState = {
  activeFault: null,
  solarDropActive: false,
  chargerContentionActive: false,
  bessThermalSpikeActive: false,
  outboxPartitionActive: false
};

app.get('/api/v1/chaos/status', (req, res) => {
  res.json(chaosState);
});

app.post('/api/v1/chaos/inject', (req, res) => {
  const { scenario } = req.body;
  if (scenario === 'SOLAR_DROP') {
    chaosState.solarDropActive = true;
    chaosState.activeFault = 'SOLAR_DROP';
    recordOutboxEvent('ChaosInjected', 'chaos_engine', 'solar', { scenario: 'SOLAR_DROP', drop_percent: 85 });
    operationalAlerts.unshift({
      id: `ALT-CHAOS-${Date.now()}`,
      type: 'GRID_VOLTAGE',
      severity: 'CRITICAL',
      status: 'OPEN',
      title: 'Solar Infeed Rapid Collapse',
      message: 'Sudden high cloud formation detected. Solar output dropped by 85%. BESS inverter switched to emergency grid-forming discharge.',
      entity_type: 'GRID_STATION',
      entity_id: 'GS-01',
      created_at: new Date().toISOString()
    });
  } else if (scenario === 'CHARGER_CONTENTION') {
    chaosState.chargerContentionActive = true;
    chaosState.activeFault = 'CHARGER_CONTENTION';
    recordOutboxEvent('ChaosInjected', 'chaos_engine', 'fleet', { scenario: 'CHARGER_CONTENTION', demand_bays: 9 });
    operationalAlerts.unshift({
      id: `ALT-CHAOS-${Date.now()}`,
      type: 'BAY_LIMIT',
      severity: 'WARNING',
      status: 'OPEN',
      title: 'Charger Bay Saturation Alert',
      message: 'All 5 Fast DC bays locked by Redlock. 4 additional vehicles queued. Shift non-urgent charging to overnight AC bays.',
      entity_type: 'CHARGER_BAY',
      entity_id: 'BAYS-1-5',
      created_at: new Date().toISOString()
    });
  } else if (scenario === 'BESS_THERMAL_ALERT') {
    chaosState.bessThermalSpikeActive = true;
    chaosState.activeFault = 'BESS_THERMAL_ALERT';
    recordOutboxEvent('ChaosInjected', 'chaos_engine', 'bess', { scenario: 'BESS_THERMAL_ALERT', temp_c: 38.6 });
    operationalAlerts.unshift({
      id: `ALT-CHAOS-${Date.now()}`,
      type: 'THERMAL',
      severity: 'WARNING',
      status: 'OPEN',
      title: 'BESS Thermal Envelope Exceeded',
      message: 'Battery module cell temp reached 38.6°C (threshold: 30°C). Auxiliary liquid cooling pumps throttled to 100% capacity.',
      entity_type: 'BESS',
      entity_id: 'BESS-01',
      created_at: new Date().toISOString()
    });
  } else if (scenario === 'POISON_MESSAGE') {
    const poisonId = `evt-poison-${Date.now()}`;
    dlqRecords.unshift({
      dlq_id: `dlq-${Date.now()}`,
      original_event_id: poisonId,
      event_type: 'TelemetryCorruptedPayload',
      failure_reason: 'Schema validation failed: expected float for irradiance_w_m2, received NaN. Quarantined after 3 retries.',
      retry_count: 3,
      quarantined_at: new Date().toISOString(),
      payload: { sensor: 'irr-sensor-03', irradiance_w_m2: 'INVALID_NAN', timestamp: new Date().toISOString() }
    });
    recordOutboxEvent('PoisonMessageQuarantined', 'dlq', poisonId, { error: 'Schema validation mismatch' });
  }

  res.json({ success: true, activeFault: chaosState.activeFault, state: chaosState });
});

app.post('/api/v1/chaos/reset', (req, res) => {
  chaosState.activeFault = null;
  chaosState.solarDropActive = false;
  chaosState.chargerContentionActive = false;
  chaosState.bessThermalSpikeActive = false;
  chaosState.outboxPartitionActive = false;
  res.json({ success: true, message: 'All chaos faults cleared. System normalized.', state: chaosState });
});

// Prometheus Metrics Scraper Endpoint (Phase 10)
app.get('/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  const nowSec = Math.floor(Date.now() / 1000);
  const metrics = `
# HELP solarops_http_requests_total Total HTTP requests handled
# TYPE solarops_http_requests_total counter
solarops_http_requests_total{status="200",method="GET"} 4129
solarops_http_requests_total{status="200",method="POST"} 894

# HELP solarops_solar_generation_kw Current instantaneous solar generation in kW
# TYPE solarops_solar_generation_kw gauge
solarops_solar_generation_kw{substation="GS-01"} 1420.0
solarops_solar_generation_kw{substation="GS-02"} 1180.0

# HELP solarops_bess_soc_percent Battery Energy Storage System SoC percentage
# TYPE solarops_bess_soc_percent gauge
solarops_bess_soc_percent{unit="BESS-01"} 77.0

# HELP solarops_active_charging_bays Number of EV fast charging bays currently occupied
# TYPE solarops_active_charging_bays gauge
solarops_active_charging_bays{station="Depot-01"} 5.0

# HELP solarops_outbox_events_total Total domain events recorded in transactional outbox
# TYPE solarops_outbox_events_total counter
solarops_outbox_events_total ${outboxRecords.length}

# HELP solarops_dlq_poison_messages_count Number of quarantined messages in dead letter queue
# TYPE solarops_dlq_poison_messages_count gauge
solarops_dlq_poison_messages_count ${dlqRecords.length}
`;
  res.send(metrics.trim());
});

// Realtime Server-Sent Events (SSE) Stream Gateway (Phase 7)
app.get('/api/v1/realtime/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Initial connection handshake
  res.write(`data: ${JSON.stringify({ type: 'HANDSHAKE', status: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  // Stream heartbeat every 4 seconds
  const interval = setInterval(() => {
    const payload = {
      type: 'TELEMETRY_PULSE',
      timestamp: new Date().toISOString(),
      grid_stations: [
        { id: 'GS-01', live_generation_kw: 1420.0, grid_export_kw: 820.0 },
        { id: 'GS-02', live_generation_kw: 1180.0, grid_export_kw: 510.0 }
      ],
      bess: { id: 'BESS-01', soc: 77.0, state: 'charging' },
      active_bays_count: 5,
      outbox_count: outboxRecords.length
    };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }, 4000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// Price Quote API (supports multi-stop delivery inputs)
app.post(['/api/orders/quote', '/api/v1/orders/quote'], (req, res) => {
  try {
    const { distanceKm, weightKg, serviceType, extraServices, deliveries } = req.body;

    let serviceMultiplier = 1.0;
    if (serviceType === 'refrigerated-cryo' || serviceType === 'cold-chain') serviceMultiplier = 1.25;
    if (serviceType === 'heavy-duty-flatbed' || serviceType === 'heavy-haul') serviceMultiplier = 1.20;
    if (serviceType === 'air-ride-vault' || serviceType === 'fragile-secure') serviceMultiplier = 1.22;
    if (serviceType === 'express-sprinter' || serviceType === 'express-rapid') serviceMultiplier = 1.18;

    const perKmRate = Number((24.0 * serviceMultiplier).toFixed(2));
    const perKgRate = 4.5;

    let totalDist = Number(distanceKm || 15);
    let totalWeight = Number(weightKg || 500);

    if (Array.isArray(deliveries) && deliveries.length > 0) {
      totalWeight = deliveries.reduce((sum: number, d: any) => sum + (Number(d.cargoWeightKg) || 0), 0);
    }

    const baseDistanceFare = Number((totalDist * perKmRate).toFixed(2));
    const weightFare = Number((totalWeight * perKgRate).toFixed(2));

    let extraFare = 0;
    if (Array.isArray(extraServices)) {
      if (extraServices.includes('hydraulic_liftgate') || extraServices.includes('tailgate_hydraulic')) extraFare += 850;
      if (extraServices.includes('iot_telemetry') || extraServices.includes('cold_logistics')) extraFare += 450;
      if (extraServices.includes('white_glove')) extraFare += 950;
      if (extraServices.includes('hazmat_containment')) extraFare += 1600;
      if (extraServices.includes('transit_insurance') || extraServices.includes('fragile_care')) extraFare += 1200;
      if (extraServices.includes('express_sprint')) extraFare += 500;
    }
    extraFare = Number(extraFare.toFixed(2));

    const subtotal = Number((baseDistanceFare + weightFare + extraFare).toFixed(2));
    const gstAmount = Number(((subtotal * 18) / 100).toFixed(2));
    const totalAmount = Number((subtotal + gstAmount).toFixed(2));

    res.json({
      success: true,
      quote: {
        distanceKm: totalDist,
        perKmRate,
        perKgRate,
        baseDistanceFare,
        weightFare,
        extraServicesFare: extraFare,
        subtotal,
        gstRatePct: 18,
        gstAmount,
        totalAmount
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to calculate quote' });
  }
});

// Open-Source Generative AI Status API
app.get('/api/v1/ai/status', async (req, res) => {
  const config = getLLMConfig();
  const isOllamaUp = await checkOllamaAvailable();
  res.json({
    status: 'online',
    provider: config.provider,
    model: config.model,
    endpoint: config.endpointUrl,
    ollama_detected: isOllamaUp,
    capabilities: [
      'Multi-stop logistics routing & tariff quotes',
      'SCADA microgrid & solar physics reasoning',
      'BESS thermal dynamics & active cooling',
      'Redis distributed lock charger scheduling',
      'Transactional outbox & NATS JetStream architecture Q&A'
    ]
  });
});

// AI Operations & Merchant Order Negotiation API
app.post(['/api/orders/chat', '/api/v1/orders/chat'], async (req, res) => {
  try {
    const { message, activeChatOrdersCount } = req.body;

    if (activeChatOrdersCount >= 5) {
      return res.json({
        reply: '⚠️ You currently have 5 active orders placed via the chatbox (our current maximum limit). Please wait for an existing order to complete, or use the "Create Order Manually" option in the Orders Dashboard for unlimited corporate fleet dispatch.',
        proposedOrder: null,
        limitReached: true,
        isOrderIntent: false,
        isGeneralInquiry: false
      });
    }

    // Process using Open-Source Generative AI Engine (Ollama / Open Source endpoint / Local Reasoning)
    const result = await processGenerativeAIChat(String(message || ''));

    res.json({
      reply: result.reply,
      isOrderIntent: result.isOrderIntent,
      isGeneralInquiry: !result.isOrderIntent,
      parsedData: result.parsedData,
      modelUsed: result.modelUsed,
      provider: result.provider
    });
  } catch (err: any) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message || 'Error processing chat request' });
  }
});

// Vite Integration
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Meridian Fleet Platform server running on http://0.0.0.0:${PORT}`);
  });
}

start();
