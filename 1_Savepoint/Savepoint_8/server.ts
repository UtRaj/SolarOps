import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialize Gemini AI client
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

// AI Merchant Chatbot & Order Negotiation API
app.post(['/api/orders/chat', '/api/v1/orders/chat'], async (req, res) => {
  try {
    const { message, activeChatOrdersCount } = req.body;

    if (activeChatOrdersCount >= 5) {
      return res.json({
        reply: '⚠️ You currently have 5 active orders placed via the chatbox (our current maximum limit). Please wait for an existing order to complete, or use the "Create Order Manually" option in the Orders Dashboard for unlimited corporate fleet dispatch.',
        proposedOrder: null,
        limitReached: true
      });
    }

    const ai = getAI();

    // Natural Language heuristic fallback in case Gemini API key is not configured
    const userMsg = String(message || '').toLowerCase();

    let originId = 2; // Default DP-02
    let pickupTime = '16:00';
    let serviceType: 'refrigerated-cryo' | 'heavy-duty-flatbed' | 'express-sprinter' | 'air-ride-vault' | 'standard-dry-van' = 'standard-dry-van';
    const extraServices: string[] = [];

    // Extract all DP occurrences
    const dpMatches = userMsg.match(/dp[- ]?0?(\d+)/gi) || [];
    const dpIds: number[] = [];
    dpMatches.forEach((m) => {
      const num = parseInt(m.replace(/\D/g, ''), 10);
      if (num >= 1 && num <= 15 && !dpIds.includes(num)) {
        dpIds.push(num);
      }
    });

    if (dpIds.length > 0) {
      originId = dpIds[0];
    }

    // Weight detection - look for numbers with kg
    const weightMatches = [...userMsg.matchAll(/(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilos|kilograms|ton|tons)/gi)];
    const parsedWeights: number[] = [];
    weightMatches.forEach((wm) => {
      const val = parseFloat(wm[1]);
      if (wm[0].toLowerCase().includes('ton')) {
        parsedWeights.push(val * 1000);
      } else {
        parsedWeights.push(val);
      }
    });

    // Time detection (e.g. 5:06 pm, 17:06, 4 pm, 14:30)
    const timeMatch = userMsg.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2] ? timeMatch[2] : '00';
      const meridiem = timeMatch[3]?.toLowerCase();
      if (meridiem === 'pm' && h < 12) h += 12;
      if (meridiem === 'am' && h === 12) h = 0;
      pickupTime = `${String(h).padStart(2, '0')}:${m}`;
    }

    // Service class and custom add-on detection
    if (userMsg.includes('cold') || userMsg.includes('chill') || userMsg.includes('pharma') || userMsg.includes('vaccine') || userMsg.includes('frozen') || userMsg.includes('cryo') || userMsg.includes('refrigerat')) {
      serviceType = 'refrigerated-cryo';
      extraServices.push('iot_telemetry');
    } else if (userMsg.includes('heavy') || userMsg.includes('machinery') || userMsg.includes('steel') || userMsg.includes('flatbed') || (parsedWeights[0] || 0) >= 2000) {
      serviceType = 'heavy-duty-flatbed';
      extraServices.push('hydraulic_liftgate');
    } else if (userMsg.includes('fragile') || userMsg.includes('delicate') || userMsg.includes('glass') || userMsg.includes('chip') || userMsg.includes('semiconductor') || userMsg.includes('sensor') || userMsg.includes('vault') || userMsg.includes('air-ride')) {
      serviceType = 'air-ride-vault';
      extraServices.push('transit_insurance');
    } else if (userMsg.includes('urgent') || userMsg.includes('express') || userMsg.includes('rapid') || userMsg.includes('rush') || userMsg.includes('quick') || userMsg.includes('sprinter')) {
      serviceType = 'express-sprinter';
    }

    if (userMsg.includes('tailgate') || userMsg.includes('liftgate') || userMsg.includes('hydraulic')) {
      if (!extraServices.includes('hydraulic_liftgate')) extraServices.push('hydraulic_liftgate');
    }
    if (userMsg.includes('iot') || userMsg.includes('telemetry') || userMsg.includes('sensor') || userMsg.includes('datalogger')) {
      if (!extraServices.includes('iot_telemetry')) extraServices.push('iot_telemetry');
    }
    if (userMsg.includes('white') || userMsg.includes('glove') || userMsg.includes('inside') || userMsg.includes('unloading')) {
      if (!extraServices.includes('white_glove')) extraServices.push('white_glove');
    }
    if (userMsg.includes('hazmat') || userMsg.includes('chemical') || userMsg.includes('dangerous') || userMsg.includes('containment')) {
      if (!extraServices.includes('hazmat_containment')) extraServices.push('hazmat_containment');
    }
    if (userMsg.includes('insurance') || userMsg.includes('coverage') || userMsg.includes('insured')) {
      if (!extraServices.includes('transit_insurance')) extraServices.push('transit_insurance');
    }

    // Build deliveries array (up to 3 deliveries)
    let deliveries: Array<{ deliveryPointId: number; cargoWeightKg: number; boxCount: number }> = [];

    // If more than 1 DP was mentioned, the rest are delivery stops (up to 3)
    const destCandidateIds = dpIds.slice(1);
    if (destCandidateIds.length > 0) {
      const stopsCount = Math.min(3, destCandidateIds.length);
      for (let i = 0; i < stopsCount; i++) {
        const stopWeight = parsedWeights[i] || (parsedWeights[0] ? Math.round(parsedWeights[0] / stopsCount) : 400);
        deliveries.push({
          deliveryPointId: destCandidateIds[i],
          cargoWeightKg: stopWeight,
          boxCount: Math.max(1, Math.round(stopWeight / 40))
        });
      }
    } else {
      // Default single delivery to DP-07
      const totalW = parsedWeights[0] || 500;
      deliveries.push({
        deliveryPointId: 7,
        cargoWeightKg: totalW,
        boxCount: Math.max(1, Math.round(totalW / 40))
      });
    }

    // If Gemini client is active, use gemini-3.8-flash for intelligent multi-stop parsing
    if (ai) {
      try {
        const prompt = `You are Meridian AI Logistics Dispatch Agent. A merchant wrote: "${message}".
Extract multi-delivery order parameters into clean JSON. Up to 3 delivery stops are supported.
Available Delivery Points: DP-01 to DP-15.
Default to origin DP-02 if unspecified.
Detect:
- originPointId (1-15)
- scheduledPickupTime (e.g. "17:06" or "14:30")
- serviceType ("refrigerated-cryo" | "heavy-duty-flatbed" | "express-sprinter" | "air-ride-vault" | "standard-dry-van")
- extraServices (array of "hydraulic_liftgate", "iot_telemetry", "white_glove", "hazmat_containment", "transit_insurance")
- deliveries: array of up to 3 objects: [{ "deliveryPointId": number (1-15), "cargoWeightKg": number, "boxCount": number }]
- summary: conversational explanation of multi-stop route, individual stop dropoffs, per-km/per-kg rates, and transparent quote.
Respond with JSON strictly in this structure:
{
  "summary": "conversational explanation of rates and multi-stop breakdown",
  "originPointId": 2,
  "scheduledPickupTime": "16:00",
  "serviceType": "refrigerated-cryo",
  "extraServices": ["iot_telemetry"],
  "deliveries": [
    { "deliveryPointId": 5, "cargoWeightKg": 400, "boxCount": 10 },
    { "deliveryPointId": 11, "cargoWeightKg": 300, "boxCount": 8 }
  ]
}`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        if (response.text) {
          const parsed = JSON.parse(response.text);
          if (Array.isArray(parsed.deliveries) && parsed.deliveries.length > 0) {
            return res.json({
              reply: parsed.summary,
              parsedData: {
                originPointId: parsed.originPointId || originId,
                scheduledPickupTime: parsed.scheduledPickupTime || pickupTime,
                serviceType: parsed.serviceType || serviceType,
                extraServices: Array.isArray(parsed.extraServices) ? parsed.extraServices : extraServices,
                deliveries: parsed.deliveries.slice(0, 3)
              }
            });
          }
        }
      } catch (geminiErr) {
        console.warn('Gemini request fallback to internal parser:', geminiErr);
      }
    }

    // Deterministic Smart Agent Response
    const serviceLabels: Record<string, string> = {
      'refrigerated-cryo': '❄️ Refrigerated Cryo-Chassis EV',
      'heavy-duty-flatbed': '🏗️ Heavy-Duty Flatbed Rig (Tailgate Lift)',
      'express-sprinter': '⚡ Aerodynamic Rapid Sprinter EV',
      'air-ride-vault': '🛡️ Air-Suspension Secure Vault',
      'standard-dry-van': '📦 Modular Enclosed Dry Van'
    };

    const totalWeightKg = deliveries.reduce((sum, d) => sum + d.cargoWeightKg, 0);
    const stopSummaryLines = deliveries
      .map((d, i) => `  • Stop ${i + 1}: Drop off ${d.cargoWeightKg.toLocaleString()} kg at DP-${String(d.deliveryPointId).padStart(2, '0')}`)
      .join('\n');

    const reply = `I have received your multi-stop delivery request! Here is our transparent Meridian tariff:
• Chassis Class: ${serviceLabels[serviceType] || '📦 Standard Commercial EV'}
• Customer Pickup: ${pickupTime} at DP-${String(originId).padStart(2, '0')}
• Total Freight: ${totalWeightKg.toLocaleString()} kg across ${deliveries.length} Delivery Stop${deliveries.length > 1 ? 's' : ''}:
${stopSummaryLines}
• Base Distance Tariff: ₹${(serviceType === 'refrigerated-cryo' ? 30.0 : 24.0).toFixed(2)}/km
• Weight Cargo Tariff: ₹4.50/kg per leg

Our dispatch system has calculated early depot departure so your allocated vehicle arrives at DP-${String(originId).padStart(2, '0')} right on time. Please review the itemized quotation below and confirm your multi-stop booking!`;

    res.json({
      reply,
      parsedData: {
        originPointId: originId,
        scheduledPickupTime: pickupTime,
        serviceType,
        extraServices,
        deliveries
      }
    });
  } catch (err: any) {
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
