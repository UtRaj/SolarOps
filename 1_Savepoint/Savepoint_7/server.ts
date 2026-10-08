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
    service: 'Meridian Fleet & Logistics AI Platform',
    timestamp: new Date().toISOString()
  });
});

// Price Quote API (supports multi-stop delivery inputs)
app.post('/api/orders/quote', (req, res) => {
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
app.post('/api/orders/chat', async (req, res) => {
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
