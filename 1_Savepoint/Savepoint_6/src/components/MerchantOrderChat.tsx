import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Truck as TruckIcon,
  ShieldAlert,
  ArrowRight,
  DollarSign,
  Package,
  Layers,
  ThermometerSnowflake,
  Zap,
  Info
} from 'lucide-react';
import {
  DeliveryPoint,
  Truck,
  MerchantOrder,
  ChatMessage,
  ServiceClass,
  ExtraServiceId,
  OrderPricing
} from '../types';
import { calculateOrderPricing, calculateEarlyDispatchTime, autoAssignTruckForOrder } from '../utils/pricingEngine';
import { EXTRA_SERVICES_CATALOG } from '../data/initialState';
import { formatTime } from '../utils/solarPhysics';

interface MerchantOrderChatProps {
  deliveryPoints: DeliveryPoint[];
  trucks: Truck[];
  orders: MerchantOrder[];
  onPlaceOrder: (order: MerchantOrder) => void;
  onViewOrders?: () => void;
  simHours: number;
}

const QUICK_PROMPTS = [
  {
    label: '❄️ Cold-Chain Pharma',
    text: 'Need cold-chain transport for 800 kg medical biologics from DP-02 to DP-11 at 15:30 with active sub-zero refrigeration.'
  },
  {
    label: '🏗️ Heavy Machinery',
    text: 'Dispatch heavy machinery parts from DP-03 to DP-14, 2,600 kg at 16:15. Need hydraulic tailgate lift.'
  },
  {
    label: '⚡ Express Courier',
    text: 'Urgent priority parcel shipment from DP-06 to DP-07, 350 kg needed at 17:00 express rapid sprint.'
  },
  {
    label: '🛡️ Fragile High-Tech',
    text: 'Deliver sensitive optical wafer equipment from DP-07 to DP-08, 420 kg at 17:15 with air-ride vibration protection.'
  }
];

export const MerchantOrderChat: React.FC<MerchantOrderChatProps> = ({
  deliveryPoints,
  trucks,
  orders,
  onPlaceOrder,
  onViewOrders,
  simHours
}) => {
  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Active chat orders count (Max 5 rule)
  const activeChatOrders = orders.filter(
    (o) => o.source === 'chatbox' && (o.status === 'scheduled' || o.status === 'dispatched_to_pickup' || o.status === 'in_transit')
  );
  const activeChatCount = activeChatOrders.length;
  const isChatLimitReached = activeChatCount >= 5;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-welcome',
      sender: 'agent',
      text: 'Hello! I am your Meridian AI Fleet Dispatch & Tariff Agent. Tell me your delivery needs — origin, destination, cargo weight, pickup time, and special requirements (e.g. cold-chain, heavy-haul, air-ride, or express). I will compute your transparent per-km and per-kg rate, add GST, and schedule the ideal electric truck to arrive at your pickup point right on time!',
      timestamp: 'Ready'
    }
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || isProcessing) return;

    if (isChatLimitReached) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          sender: 'user',
          text,
          timestamp: formatTime(simHours)
        },
        {
          id: `msg-limit-${Date.now()}`,
          sender: 'system',
          text: '⚠️ Active chat order limit reached (5/5). You can have up to 5 concurrent orders from the chatbox. Please wait for an active order to complete or use "Create Order Manually" in the Orders Dashboard for unlimited fleet bookings.',
          timestamp: formatTime(simHours)
        }
      ]);
      setInputMessage('');
      return;
    }

    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: formatTime(simHours)
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsProcessing(true);

    try {
      // Call server backend API
      const res = await fetch('/api/orders/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          activeChatOrdersCount: activeChatCount
        })
      });

      if (!res.ok) {
        throw new Error('API request failed');
      }

      const data = await res.json();
      const parsed = data.parsedData || {};

      // Resolve Delivery Points
      const originDP =
        deliveryPoints.find((dp) => dp.id === parsed.originPointId) ||
        deliveryPoints.find((dp) => dp.id === 2) ||
        deliveryPoints[0];

      const destDP =
        deliveryPoints.find((dp) => dp.id === parsed.destinationPointId) ||
        deliveryPoints.find((dp) => dp.id === 7) ||
        deliveryPoints[1];

      const weightKg = Number(parsed.weightKg) || 500;
      const serviceType: ServiceClass = parsed.serviceType || 'standard';
      const extraServices: ExtraServiceId[] = Array.isArray(parsed.extraServices)
        ? parsed.extraServices
        : [];

      // Calculate transparent pricing
      const pricing = calculateOrderPricing(originDP, destDP, weightKg, serviceType, extraServices);

      // Parse scheduled pickup time in decimal hours
      let pickupHours = simHours + 0.5; // Default 30 min from current sim time
      if (parsed.scheduledPickupTime) {
        const parts = String(parsed.scheduledPickupTime).split(':');
        if (parts.length === 2) {
          pickupHours = parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60;
        }
      }

      // Calculate early departure time so truck reaches origin on time
      const earlyInfo = calculateEarlyDispatchTime(originDP.coords, pickupHours);

      // AI truck auto-assignment
      const assignedTruck = autoAssignTruckForOrder(trucks, serviceType, weightKg);

      const proposedOrder: Partial<MerchantOrder> & { pricing: OrderPricing } = {
        id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
        source: 'chatbox',
        merchantName: 'Enterprise Client',
        originPointId: originDP.id,
        originPointName: `${originDP.name} (${originDP.code})`,
        destinationPointId: destDP.id,
        destinationPointName: `${destDP.name} (${destDP.code})`,
        weightKg,
        boxCount: Math.max(1, Math.round(weightKg / 40)),
        scheduledPickupTimeHours: pickupHours,
        calculatedDispatchTimeHours: earlyInfo.calculatedDispatchTimeHours,
        transitMinutesFromBay: earlyInfo.transitMinutesFromBay,
        requiredService: serviceType,
        extraServices,
        pricing,
        status: 'scheduled',
        assignedTruckId: assignedTruck ? assignedTruck.id : null,
        createdAtTimestamp: formatTime(simHours),
        specialInstructions: `Auto-dispatched via AI Merchant Agent for ${originDP.code} -> ${destDP.code}`
      };

      setMessages((prev) => [
        ...prev,
        {
          id: `agent-${Date.now()}`,
          sender: 'agent',
          text: data.reply || 'Here is your customized logistics quotation and scheduled dispatch preview:',
          timestamp: formatTime(simHours),
          proposedOrder
        }
      ]);
    } catch (err) {
      // Offline / network fallback with local engine
      const originDP = deliveryPoints.find((dp) => dp.id === 2) || deliveryPoints[0];
      const destDP = deliveryPoints.find((dp) => dp.id === 7) || deliveryPoints[1];
      const weightKg = 600;
      const serviceType: ServiceClass = text.toLowerCase().includes('cold') ? 'cold-chain' : 'standard';
      const extraServices: ExtraServiceId[] = serviceType === 'cold-chain' ? ['cold_logistics'] : [];

      const pricing = calculateOrderPricing(originDP, destDP, weightKg, serviceType, extraServices);
      const earlyInfo = calculateEarlyDispatchTime(originDP.coords, simHours + 0.75);
      const assignedTruck = autoAssignTruckForOrder(trucks, serviceType, weightKg);

      const proposedOrder: Partial<MerchantOrder> & { pricing: OrderPricing } = {
        id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
        source: 'chatbox',
        merchantName: 'Enterprise Client',
        originPointId: originDP.id,
        originPointName: `${originDP.name} (${originDP.code})`,
        destinationPointId: destDP.id,
        destinationPointName: `${destDP.name} (${destDP.code})`,
        weightKg,
        boxCount: 15,
        scheduledPickupTimeHours: simHours + 0.75,
        calculatedDispatchTimeHours: earlyInfo.calculatedDispatchTimeHours,
        transitMinutesFromBay: earlyInfo.transitMinutesFromBay,
        requiredService: serviceType,
        extraServices,
        pricing,
        status: 'scheduled',
        assignedTruckId: assignedTruck ? assignedTruck.id : null,
        createdAtTimestamp: formatTime(simHours)
      };

      setMessages((prev) => [
        ...prev,
        {
          id: `agent-${Date.now()}`,
          sender: 'agent',
          text: 'Quotation ready: Based on your delivery specifications, here is our transparent tariff calculation and allocated vehicle:',
          timestamp: formatTime(simHours),
          proposedOrder
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmOrder = (msgId: string, proposed: Partial<MerchantOrder> & { pricing: OrderPricing }) => {
    if (isChatLimitReached) {
      alert('Active chat order limit (5/5) reached! Please complete an order first or use manual dashboard.');
      return;
    }

    const fullOrder: MerchantOrder = {
      id: proposed.id || `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      source: 'chatbox',
      merchantName: proposed.merchantName || 'Corporate Merchant',
      originPointId: proposed.originPointId || 2,
      originPointName: proposed.originPointName || 'North Cargo Terminal (DP-02)',
      destinationPointId: proposed.destinationPointId || 7,
      destinationPointName: proposed.destinationPointName || 'East Tech Park (DP-07)',
      weightKg: proposed.weightKg || 500,
      boxCount: proposed.boxCount || 10,
      scheduledPickupTimeHours: proposed.scheduledPickupTimeHours || simHours + 0.5,
      calculatedDispatchTimeHours: proposed.calculatedDispatchTimeHours || simHours + 0.25,
      transitMinutesFromBay: proposed.transitMinutesFromBay || 15,
      requiredService: proposed.requiredService || 'standard',
      extraServices: proposed.extraServices || [],
      pricing: proposed.pricing,
      status: 'scheduled',
      assignedTruckId: proposed.assignedTruckId ?? null,
      createdAtTimestamp: formatTime(simHours),
      specialInstructions: proposed.specialInstructions
    };

    onPlaceOrder(fullOrder);

    // Update message state to show confirmed
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === msgId) {
          return { ...m, isConfirmed: true };
        }
        return m;
      })
    );
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Top Banner with Quota & Policy Notice */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Meridian AI Merchant Dispatch Desk</h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Live Pricing &amp; Timed Dispatch
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Per-km &amp; per-kg automated pricing · Cold-chain, heavy-haul, &amp; fragile add-ons · Timed early depot departure
            </p>
          </div>
        </div>

        {/* 5-Order Limit Badge */}
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            isChatLimitReached
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isChatLimitReached ? 'bg-amber-500 animate-ping' : 'bg-blue-500'}`} />
            <span>Chat Orders: {activeChatCount} / 5 Active</span>
          </div>
        </div>
      </div>

      {/* Quick Prompt Starters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 font-medium whitespace-nowrap">Try asking:</span>
        {QUICK_PROMPTS.map((qp, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(qp.text)}
            disabled={isProcessing || isChatLimitReached}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 transition-colors whitespace-nowrap font-medium cursor-pointer disabled:opacity-50"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Chat Messages Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[580px] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender !== 'user' && (
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  msg.sender === 'system' ? 'bg-amber-100 text-amber-700' : 'bg-blue-600 text-white shadow-xs'
                }`}>
                  {msg.sender === 'system' ? <AlertCircle className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
              )}

              <div className={`max-w-2xl space-y-3 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`p-4 rounded-2xl text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-xs shadow-xs'
                      : msg.sender === 'system'
                      ? 'bg-amber-50 border border-amber-200 text-amber-900 rounded-tl-xs'
                      : 'bg-slate-50 border border-slate-200/80 text-slate-800 rounded-tl-xs'
                  }`}
                >
                  <p className="whitespace-pre-line">{msg.text}</p>
                </div>

                {/* Proposed Order Interactive Quote Card */}
                {msg.proposedOrder && msg.proposedOrder.pricing && (
                  <div className="bg-white border-2 border-blue-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full">
                          {msg.proposedOrder.id}
                        </span>
                        <span className="text-xs font-semibold text-slate-700 capitalize">
                          {msg.proposedOrder.requiredService?.replace('-', ' ')} Service Class
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        Pickup: {formatTime(msg.proposedOrder.scheduledPickupTimeHours || 0)}
                      </span>
                    </div>

                    {/* Route & Timed Dispatch Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl text-xs">
                      <div>
                        <span className="text-slate-400 block font-medium">Origin Pickup</span>
                        <span className="font-semibold text-slate-800">{msg.proposedOrder.originPointName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Destination</span>
                        <span className="font-semibold text-slate-800">{msg.proposedOrder.destinationPointName}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Payload &amp; Boxes</span>
                        <span className="font-semibold text-slate-800">
                          {msg.proposedOrder.weightKg?.toLocaleString()} kg ({msg.proposedOrder.boxCount} boxes)
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Depot Early Departure</span>
                        <span className="font-bold text-blue-700">
                          {formatTime(msg.proposedOrder.calculatedDispatchTimeHours || 0)} ({msg.proposedOrder.transitMinutesFromBay} min prior)
                        </span>
                      </div>
                    </div>

                    {/* Allocated Truck */}
                    <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white text-xs">
                      <div className="flex items-center gap-2">
                        <TruckIcon className="w-4 h-4 text-emerald-600" />
                        <span className="text-slate-600 font-medium">AI Allocated Vehicle:</span>
                        <span className="font-bold text-slate-800">
                          {trucks.find((t) => t.id === msg.proposedOrder?.assignedTruckId)?.name || 'Next Available EV'}
                        </span>
                      </div>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {trucks.find((t) => t.id === msg.proposedOrder?.assignedTruckId)?.specialization.categoryLabel}
                      </span>
                    </div>

                    {/* Transparent Price Breakdown */}
                    <div className="space-y-1.5 text-xs border-t border-slate-100 pt-3">
                      <div className="flex justify-between text-slate-600">
                        <span>Distance Fare ({msg.proposedOrder.pricing.distanceKm} km @ ₹{msg.proposedOrder.pricing.perKmRate}/km)</span>
                        <span className="font-mono">₹{msg.proposedOrder.pricing.baseDistanceFare.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Weight Charge ({msg.proposedOrder.weightKg} kg @ ₹{msg.proposedOrder.pricing.perKgRate}/kg)</span>
                        <span className="font-mono">₹{msg.proposedOrder.pricing.weightFare.toFixed(2)}</span>
                      </div>
                      {msg.proposedOrder.pricing.extraServicesFare > 0 && (
                        <div className="flex justify-between text-cyan-700">
                          <span>Special Service Add-ons</span>
                          <span className="font-mono">+₹{msg.proposedOrder.pricing.extraServicesFare.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600 pt-1 border-t border-dashed border-slate-200">
                        <span>Subtotal (Excl. Tax)</span>
                        <span className="font-mono font-medium">₹{msg.proposedOrder.pricing.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Goods &amp; Transport GST (18%)</span>
                        <span className="font-mono">+₹{msg.proposedOrder.pricing.gstAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                        <span>Total Payable Quote</span>
                        <span className="font-mono text-emerald-700 text-base">
                          ₹{msg.proposedOrder.pricing.totalAmount.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-1">
                      {msg.isConfirmed ? (
                        <div className="w-full py-2 px-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Order Placed &amp; Scheduled on Dashboard!</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleConfirmOrder(msg.id, msg.proposedOrder!)}
                          disabled={isChatLimitReached}
                          className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <span>Confirm &amp; Place Order (₹{msg.proposedOrder.pricing.totalAmount.toFixed(2)})</span>
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-slate-400 font-mono">
                  {msg.timestamp}
                </div>
              </div>

              {msg.sender === 'user' && (
                <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isProcessing && (
            <div className="flex gap-3 items-center text-xs text-slate-500 italic">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <span>Meridian AI is analyzing distance, payload, truck match, and generating tariff breakdown...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="border-t border-slate-200 p-3 bg-slate-50">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={
                isChatLimitReached
                  ? 'Limit reached (5/5 chat orders active). Complete an order or use manual dashboard.'
                  : 'Ask for delivery: e.g. "Send 700 kg from DP-02 to DP-11 at 15:30 with cold chain"'
              }
              disabled={isProcessing || isChatLimitReached}
              className="flex-1 bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-2xs disabled:bg-slate-100 cursor-text"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isProcessing || isChatLimitReached}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>Send</span>
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
