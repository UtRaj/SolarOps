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

// Price Quote API
app.post('/api/orders/quote', (req, res) => {
  try {
    const { distanceKm, weightKg, serviceType, extraServices } = req.body;

    let serviceMultiplier = 1.0;
    if (serviceType === 'cold-chain') serviceMultiplier = 1.25;
    if (serviceType === 'heavy-haul') serviceMultiplier = 1.20;
    if (serviceType === 'fragile-secure') serviceMultiplier = 1.22;
    if (serviceType === 'express-rapid') serviceMultiplier = 1.18;

    const perKmRate = Number((24.0 * serviceMultiplier).toFixed(2));
    const perKgRate = 4.5;

    const baseDistanceFare = Number((Number(distanceKm || 15) * perKmRate).toFixed(2));
    const weightFare = Number((Number(weightKg || 500) * perKgRate).toFixed(2));

    let extraFare = 0;
    if (Array.isArray(extraServices)) {
      if (extraServices.includes('cold_logistics')) extraFare += (baseDistanceFare + weightFare) * 0.20;
      if (extraServices.includes('fragile_care')) extraFare += (baseDistanceFare + weightFare) * 0.15;
      if (extraServices.includes('express_sprint')) extraFare += (baseDistanceFare + weightFare) * 0.20;
      if (extraServices.includes('tailgate_hydraulic')) extraFare += 220;
    }
    extraFare = Number(extraFare.toFixed(2));

    const subtotal = Number((baseDistanceFare + weightFare + extraFare).toFixed(2));
    const gstAmount = Number(((subtotal * 18) / 100).toFixed(2));
    const totalAmount = Number((subtotal + gstAmount).toFixed(2));

    res.json({
      success: true,
      quote: {
        distanceKm: Number(distanceKm || 15),
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
    let destId = 7;   // Default DP-07
    let weightKg = 500;
    let pickupTime = '16:00';
    let serviceType: 'cold-chain' | 'heavy-haul' | 'express-rapid' | 'fragile-secure' | 'standard' = 'standard';
    const extraServices: string[] = [];

    // Check delivery points mentioned (e.g. dp-02, dp 2, etc.)
    const dpMatches = userMsg.match(/dp[- ]?0?(\d+)/gi);
    if (dpMatches && dpMatches.length >= 2) {
      const p1 = parseInt(dpMatches[0].replace(/\D/g, ''), 10);
      const p2 = parseInt(dpMatches[1].replace(/\D/g, ''), 10);
      if (p1 >= 1 && p1 <= 15) originId = p1;
      if (p2 >= 1 && p2 <= 15) destId = p2;
    } else if (dpMatches && dpMatches.length === 1) {
      const p1 = parseInt(dpMatches[0].replace(/\D/g, ''), 10);
      if (p1 >= 1 && p1 <= 15) originId = p1;
    }

    // Weight detection
    const weightMatch = userMsg.match(/(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilos|kilograms|ton|tons)/i);
    if (weightMatch) {
      const val = parseFloat(weightMatch[1]);
      if (userMsg.includes('ton')) {
        weightKg = val * 1000;
      } else {
        weightKg = val;
      }
    }

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

    // Service requirements
    if (userMsg.includes('cold') || userMsg.includes('chill') || userMsg.includes('pharma') || userMsg.includes('vaccine') || userMsg.includes('frozen') || userMsg.includes('perish')) {
      serviceType = 'cold-chain';
      extraServices.push('cold_logistics');
    } else if (userMsg.includes('heavy') || userMsg.includes('machinery') || userMsg.includes('steel') || weightKg >= 2000) {
      serviceType = 'heavy-haul';
      extraServices.push('tailgate_hydraulic');
    } else if (userMsg.includes('fragile') || userMsg.includes('delicate') || userMsg.includes('glass') || userMsg.includes('chip') || userMsg.includes('semiconductor') || userMsg.includes('sensor')) {
      serviceType = 'fragile-secure';
      extraServices.push('fragile_care');
    } else if (userMsg.includes('urgent') || userMsg.includes('express') || userMsg.includes('rapid') || userMsg.includes('rush') || userMsg.includes('quick') || userMsg.includes('fast')) {
      serviceType = 'express-rapid';
      extraServices.push('express_sprint');
    }

    // If Gemini client is active, use gemini-3.8-flash for intelligent parsing
    if (ai) {
      try {
        const prompt = `You are Meridian AI Logistics Dispatch Agent. A merchant wrote: "${message}".
Extract delivery order parameters into clean JSON.
Available Delivery Points: DP-01 to DP-15.
Default to origin DP-02, destination DP-07 if unspecified.
Detect weightKg (number), originPointId (1-15), destinationPointId (1-15), scheduledPickupTime (e.g. "17:06" or "14:30"), serviceType ("cold-chain" | "heavy-haul" | "express-rapid" | "fragile-secure" | "standard"), extraServices (array of "cold_logistics", "fragile_care", "express_sprint", "tailgate_hydraulic"), and conversational text summary explaining the per-km/per-kg rates and total quote.
Respond with JSON strictly in this structure:
{
  "summary": "conversational explanation of rates and breakdown",
  "originPointId": 2,
  "destinationPointId": 7,
  "weightKg": 500,
  "scheduledPickupTime": "16:00",
  "serviceType": "cold-chain",
  "extraServices": ["cold_logistics"]
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
          return res.json({
            reply: parsed.summary,
            parsedData: parsed
          });
        }
      } catch (geminiErr) {
        console.warn('Gemini request fallback to internal parser:', geminiErr);
      }
    }

    // Deterministic Smart Agent Response
    const serviceLabels = {
      'cold-chain': '❄️ Cold-Chain Refrigerated (Sub-Zero Cryo Unit)',
      'heavy-haul': '🏗️ Heavy-Haul Electric Freight (Hydraulic Tailgate Lift)',
      'express-rapid': '⚡ Express Rapid Sprint EV (Priority Corridor)',
      'fragile-secure': '🛡️ Secure Fragile & High-Tech (Pneumatic Air-Ride)',
      'standard': '📦 Standard Medium Commercial EV'
    };

    const reply = `I have received your delivery request! Here is our standard Meridian tariff:
• Base Distance Tariff: ₹${(serviceType === 'cold-chain' ? 30.0 : 24.0).toFixed(2)}/km
• Weight Cargo Tariff: ₹4.50/kg
• Service Class: ${serviceLabels[serviceType]}
• Scheduled Customer Pickup: ${pickupTime} at DP-${String(originId).padStart(2, '0')}
• Destination: DP-${String(destId).padStart(2, '0')}
• Cargo Weight: ${weightKg.toLocaleString()} kg

Our dispatch system will automatically allocate a specialized EV truck and depart the depot early so it reaches DP-${String(originId).padStart(2, '0')} right on time. Please review the itemized quote below and click "Confirm & Place Order" to schedule the dispatch!`;

    res.json({
      reply,
      parsedData: {
        originPointId: originId,
        destinationPointId: destId,
        weightKg,
        scheduledPickupTime: pickupTime,
        serviceType,
        extraServices
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
