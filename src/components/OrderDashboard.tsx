import React, { useState } from 'react';
import {
  Package,
  Plus,
  Truck as TruckIcon,
  Clock,
  MapPin,
  DollarSign,
  Filter,
  CheckCircle2,
  AlertCircle,
  Play,
  X,
  Layers,
  ThermometerSnowflake,
  Shield,
  Zap,
  ArrowRight,
  ChevronRight,
  Info
} from 'lucide-react';
import {
  MerchantOrder,
  DeliveryPoint,
  Truck,
  ServiceClass,
  ExtraServiceId,
  OrderStatus
} from '../types';
import {
  calculateOrderPricing,
  calculateMultiStopPricing,
  calculateEarlyDispatchTime,
  autoAssignTruckForOrder,
  DeliveryStopInput
} from '../utils/pricingEngine';
import { EXTRA_SERVICES_CATALOG } from '../data/initialState';
import { formatTime } from '../utils/solarPhysics';

interface OrderDashboardProps {
  orders: MerchantOrder[];
  deliveryPoints: DeliveryPoint[];
  trucks: Truck[];
  onAddOrder: (order: MerchantOrder) => void;
  onDispatchOrderNow: (orderId: string) => void;
  onCancelOrder: (orderId: string) => void;
  simHours: number;
  onOpenChat: () => void;
}

interface ManualDeliveryStop {
  deliveryPointId: number;
  cargoWeightKg: number;
  boxCount: number;
}

export const OrderDashboard: React.FC<OrderDashboardProps> = ({
  orders,
  deliveryPoints,
  trucks,
  onAddOrder,
  onDispatchOrderNow,
  onCancelOrder,
  simHours,
  onOpenChat
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'scheduled' | 'active' | 'delivered'>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Manual Order Form State
  const [merchantName, setMerchantName] = useState('');
  const [originId, setOriginId] = useState<number>(2);
  const [deliveryStops, setDeliveryStops] = useState<ManualDeliveryStop[]>([
    { deliveryPointId: 7, cargoWeightKg: 500, boxCount: 12 }
  ]);
  const [pickupHours, setPickupHours] = useState<number>(Number((simHours + 0.5).toFixed(2)));
  const [serviceType, setServiceType] = useState<ServiceClass>('standard-dry-van');
  const [selectedExtras, setSelectedExtras] = useState<ExtraServiceId[]>([]);
  const [manualTruckId, setManualTruckId] = useState<number | 'auto'>('auto');
  const [specialNotes, setSpecialNotes] = useState('');

  // Total calculated weight across all delivery stops
  const totalCargoWeightKg = deliveryStops.reduce((sum, s) => sum + s.cargoWeightKg, 0);
  const totalBoxesCount = deliveryStops.reduce((sum, s) => sum + s.boxCount, 0);

  // Metrics
  const totalOrders = orders.length;
  const scheduledCount = orders.filter((o) => o.status === 'scheduled').length;
  const inTransitCount = orders.filter((o) => o.status === 'dispatched_to_pickup' || o.status === 'in_transit').length;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;
  const totalRevenue = orders.reduce((sum, o) => sum + o.pricing.totalAmount, 0);
  const totalGst = orders.reduce((sum, o) => sum + o.pricing.gstAmount, 0);

  // Filtered orders
  const filteredOrders = orders.filter((o) => {
    if (activeFilter === 'scheduled') return o.status === 'scheduled';
    if (activeFilter === 'active') return o.status === 'dispatched_to_pickup' || o.status === 'in_transit';
    if (activeFilter === 'delivered') return o.status === 'delivered';
    return true;
  });

  // Calculate live preview for multi-stop manual modal
  const originDP = deliveryPoints.find((dp) => dp.id === originId) || deliveryPoints[0];
  const stopsForPricing: DeliveryStopInput[] = deliveryStops.map((s) => {
    const dp = deliveryPoints.find((p) => p.id === s.deliveryPointId) || deliveryPoints[1];
    return {
      deliveryPoint: dp,
      cargoWeightKg: s.cargoWeightKg,
      boxCount: s.boxCount
    };
  });

  const previewPricing = calculateMultiStopPricing(originDP, stopsForPricing, serviceType, selectedExtras);
  const earlyPreview = calculateEarlyDispatchTime(originDP.coords, pickupHours);

  // Suggested truck based on total weight and chassis specialization
  const suggestedTruck = manualTruckId === 'auto'
    ? autoAssignTruckForOrder(trucks, serviceType, totalCargoWeightKg)
    : trucks.find((t) => t.id === manualTruckId);

  const handleToggleExtra = (id: ExtraServiceId) => {
    setSelectedExtras((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleAddStop = () => {
    if (deliveryStops.length >= 3) return;
    const usedIds = [originId, ...deliveryStops.map((s) => s.deliveryPointId)];
    const nextDP = deliveryPoints.find((dp) => !usedIds.includes(dp.id)) || deliveryPoints[(deliveryStops.length + 3) % deliveryPoints.length];
    setDeliveryStops((prev) => [
      ...prev,
      { deliveryPointId: nextDP.id, cargoWeightKg: 350, boxCount: 9 }
    ]);
  };

  const handleRemoveStop = (index: number) => {
    if (deliveryStops.length <= 1) return;
    setDeliveryStops((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateStop = (index: number, field: keyof ManualDeliveryStop, value: number) => {
    setDeliveryStops((prev) =>
      prev.map((stop, i) => {
        if (i !== index) return stop;
        const updated = { ...stop, [field]: value };
        if (field === 'cargoWeightKg') {
          updated.boxCount = Math.max(1, Math.round(value / 40));
        }
        return updated;
      })
    );
  };

  const handleCreateOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const firstDestDP = deliveryPoints.find((dp) => dp.id === deliveryStops[0].deliveryPointId) || deliveryPoints[1];

    const orderDeliveries = deliveryStops.map((s, idx) => {
      const dp = deliveryPoints.find((p) => p.id === s.deliveryPointId) || deliveryPoints[1];
      return {
        stopIndex: idx,
        deliveryPointId: dp.id,
        deliveryPointName: `${dp.name} (${dp.code})`,
        cargoWeightKg: s.cargoWeightKg,
        boxCount: s.boxCount
      };
    });

    const newOrder: MerchantOrder = {
      id: `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      source: 'manual',
      merchantName: merchantName.trim() || 'Direct Client Logistics',
      originPointId: originDP.id,
      originPointName: `${originDP.name} (${originDP.code})`,
      destinationPointId: firstDestDP.id,
      destinationPointName: `${firstDestDP.name} (${firstDestDP.code})`,
      weightKg: totalCargoWeightKg,
      boxCount: totalBoxesCount,
      deliveries: orderDeliveries,
      totalWeightKg: totalCargoWeightKg,
      totalBoxes: totalBoxesCount,
      scheduledPickupTimeHours: pickupHours,
      calculatedDispatchTimeHours: earlyPreview.calculatedDispatchTimeHours,
      transitMinutesFromBay: earlyPreview.transitMinutesFromBay,
      requiredService: serviceType,
      extraServices: selectedExtras,
      pricing: previewPricing,
      status: 'scheduled',
      assignedTruckId: suggestedTruck ? suggestedTruck.id : null,
      createdAtTimestamp: formatTime(simHours),
      specialInstructions: specialNotes.trim() || undefined
    };

    onAddOrder(newOrder);
    setIsCreateModalOpen(false);
    // Reset form
    setMerchantName('');
    setDeliveryStops([{ deliveryPointId: 7, cargoWeightKg: 500, boxCount: 12 }]);
    setSpecialNotes('');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Actions */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Commercial Orders &amp; Dispatch Pipeline</h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Enterprise Fleet Operations
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time merchant order tracking, automated GST tariffs, capability-matched EV dispatch, and precision early depot departures.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            id="open-merchant-chat-btn"
            onClick={onOpenChat}
            className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <span>💬 Merchant AI Chat</span>
          </button>
          <button
            id="create-order-manually-btn"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Order Manually</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Total Orders</span>
            <Package className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalOrders}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Corporate &amp; Chatbox</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Scheduled Pickups</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{scheduledCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Awaiting depot departure</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">En Route / In Transit</span>
            <TruckIcon className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{inTransitCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Active on road</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Delivered Today</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-indigo-700 mt-1">{deliveredCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Completed &amp; returned</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Gross Billed (Incl. GST)</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">₹{totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">₹{totalGst.toFixed(0)} 18% GST</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200/80 shadow-2xs">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Orders ({totalOrders})
          </button>
          <button
            onClick={() => setActiveFilter('scheduled')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'scheduled' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Scheduled ({scheduledCount})
          </button>
          <button
            onClick={() => setActiveFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'active' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Active In-Transit ({inTransitCount})
          </button>
          <button
            onClick={() => setActiveFilter('delivered')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeFilter === 'delivered' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Delivered ({deliveredCount})
          </button>
        </div>

        <span className="text-xs text-slate-500 font-mono">
          Current Sim Clock: {formatTime(simHours)}
        </span>
      </div>

      {/* Orders Table / Cards List */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
            <p className="text-sm font-semibold text-slate-600">No orders match this filter.</p>
            <p className="text-xs mt-1">Book an order via the AI Merchant Chat or click &quot;Create Order Manually&quot;.</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const assignedTruck = trucks.find((t) => t.id === order.assignedTruckId);
            const isDueForDispatch =
              order.status === 'scheduled' && simHours >= order.calculatedDispatchTimeHours;

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
              >
                {/* Order Identity & Route Info */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md border border-slate-200">
                      {order.id}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{order.merchantName}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize ${
                      order.source === 'chatbox'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {order.source}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 capitalize">
                      {order.requiredService.replace('-', ' ')}
                    </span>
                  </div>

                  {/* Route & Stop points */}
                  <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                    <div className="flex items-center gap-1 font-medium">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span>{order.originPointName}</span>
                    </div>

                    {order.deliveries && order.deliveries.length > 1 ? (
                      order.deliveries.map((d, i) => (
                        <React.Fragment key={d.stopIndex}>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          <div className="flex items-center gap-1 font-medium bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-md border border-emerald-200">
                            <MapPin className="w-3 h-3 text-emerald-600" />
                            <span>Stop {i + 1}: {d.deliveryPointName} ({d.cargoWeightKg} kg)</span>
                          </div>
                        </React.Fragment>
                      ))
                    ) : (
                      <>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <div className="flex items-center gap-1 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{order.destinationPointName}</span>
                        </div>
                      </>
                    )}

                    <span className="text-slate-400">·</span>
                    <span className="font-mono text-slate-500">{order.pricing.distanceKm} km</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold text-slate-700">
                      {(order.totalWeightKg || order.weightKg).toLocaleString()} kg ({order.totalBoxes || order.boxCount} boxes)
                    </span>
                    {order.deliveries && order.deliveries.length > 1 && (
                      <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                        {order.deliveries.length} Stops Multi-Route
                      </span>
                    )}
                  </div>

                  {/* Timing & Precision Dispatch */}
                  <div className="flex items-center gap-3 text-xs flex-wrap">
                    <div className="flex items-center gap-1 text-slate-600">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Target Pickup: <strong className="text-slate-800">{formatTime(order.scheduledPickupTimeHours)}</strong></span>
                    </div>
                    <div className="flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                      <span>Early Depot Departure: <strong>{formatTime(order.calculatedDispatchTimeHours)}</strong> ({order.transitMinutesFromBay}m prior)</span>
                    </div>
                    {isDueForDispatch && (
                      <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md text-[11px] font-bold animate-pulse border border-amber-200">
                        ⚡ Scheduled departure time reached!
                      </span>
                    )}

                    {order.pricing.stopBreakdown && order.pricing.stopBreakdown.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                        className="text-xs text-blue-600 hover:text-blue-800 underline font-medium cursor-pointer"
                      >
                        {expandedOrderId === order.id ? 'Hide Multi-Stop Leg Details' : `View ${order.pricing.stopBreakdown.length}-Stop Billing Details`}
                      </button>
                    )}
                  </div>

                  {/* Multi-Stop Expandable Leg Details */}
                  {expandedOrderId === order.id && order.pricing.stopBreakdown && (
                    <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                      <div className="font-bold text-slate-700 flex justify-between">
                        <span>Multi-Route Delivery Leg Tariffs</span>
                        <span className="text-slate-500 font-mono">₹{order.pricing.perKmRate}/km · ₹{order.pricing.perKgRate}/kg</span>
                      </div>
                      <div className="space-y-1.5">
                        {order.pricing.stopBreakdown.map((sb, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200/80">
                            <div>
                              <span className="font-bold text-slate-800">Stop {idx + 1}: {sb.pointName}</span>
                              <span className="text-slate-500 ml-2">({sb.legDistanceKm} km · {sb.cargoWeightKg} kg dropoff)</span>
                            </div>
                            <div className="font-mono font-semibold text-slate-700">
                              ₹{sb.stopSubtotal.toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Assigned Truck & Capability Badge */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 lg:gap-6 border-t lg:border-t-0 pt-3 lg:pt-0 w-full lg:w-auto">
                  <div className="text-xs space-y-1">
                    <span className="text-slate-400 block font-medium">Assigned Vehicle</span>
                    {assignedTruck ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                          <TruckIcon className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-800">{assignedTruck.name}</span>
                          <span className="text-[11px] text-slate-500 ml-1.5 font-mono">
                            ({assignedTruck.soc.toFixed(0)}% SoC)
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-amber-600 font-medium">Auto-assigning...</span>
                    )}
                  </div>

                  {/* Price Breakdown */}
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900 font-mono">
                      ₹{order.pricing.totalAmount.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Incl. ₹{order.pricing.gstAmount.toFixed(2)} GST
                    </div>
                  </div>

                  {/* Status Badge & Dispatch Button */}
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border capitalize ${
                      order.status === 'scheduled'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : order.status === 'dispatched_to_pickup'
                        ? 'bg-sky-50 text-sky-800 border-sky-200'
                        : order.status === 'in_transit'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : order.status === 'delivered'
                        ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>

                    {order.status === 'scheduled' && (
                      <button
                        onClick={() => onDispatchOrderNow(order.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                        title="Manually dispatch truck immediately from bay"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Dispatch Now</span>
                      </button>
                    )}

                    {order.status === 'scheduled' && (
                      <button
                        onClick={() => onCancelOrder(order.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Cancel Order"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* "Create Order Manually" Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Create Commercial Order (Multi-Route Support)</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrderSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Merchant Details */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Merchant / Company Name
                </label>
                <input
                  type="text"
                  required
                  value={merchantName}
                  onChange={(e) => setMerchantName(e.target.value)}
                  placeholder="e.g. Apex Biotech Labs / Global Logistics"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Origin Pickup Point */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Pickup Location (Origin)
                </label>
                <select
                  value={originId}
                  onChange={(e) => setOriginId(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                >
                  {deliveryPoints.map((dp) => (
                    <option key={dp.id} value={dp.id}>
                      {dp.code} - {dp.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Multi-Stop Deliveries (Up to 3 Stops) */}
              <div className="space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Delivery Stops ({deliveryStops.length} of 3 Allowed)
                    </label>
                    <span className="text-[11px] text-blue-700 bg-blue-50 font-semibold px-2 py-0.5 rounded-md border border-blue-200">
                      Multi-Stop Dispatch
                    </span>
                  </div>
                  {deliveryStops.length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddStop}
                      className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Stop ({deliveryStops.length + 1}/3)</span>
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {deliveryStops.map((stop, idx) => (
                    <div key={idx} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span>Delivery Stop #{idx + 1}</span>
                        </span>
                        {deliveryStops.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveStop(idx)}
                            className="text-slate-400 hover:text-rose-600 p-1 text-xs rounded-md hover:bg-rose-50 cursor-pointer"
                            title="Remove Stop"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1">
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Destination Point
                          </label>
                          <select
                            value={stop.deliveryPointId}
                            onChange={(e) => handleUpdateStop(idx, 'deliveryPointId', Number(e.target.value))}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-blue-500 cursor-pointer"
                          >
                            {deliveryPoints.map((dp) => (
                              <option key={dp.id} value={dp.id} disabled={dp.id === originId}>
                                {dp.code} - {dp.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Cargo Weight (kg)
                          </label>
                          <input
                            type="number"
                            min="20"
                            max="3000"
                            step="20"
                            value={stop.cargoWeightKg}
                            onChange={(e) => handleUpdateStop(idx, 'cargoWeightKg', Number(e.target.value))}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Box Units
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={stop.boxCount}
                            onChange={(e) => handleUpdateStop(idx, 'boxCount', Number(e.target.value))}
                            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1 text-xs text-slate-600 font-medium">
                  <span>Total Consolidated Cargo:</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {totalCargoWeightKg.toLocaleString()} kg · {totalBoxesCount} boxes
                  </span>
                </div>
              </div>

              {/* Scheduled Pickup Time */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Customer Pickup Time: {formatTime(pickupHours)}
                  </label>
                  <span className="text-xs font-bold text-blue-700 font-mono">
                    Depot Departure: {formatTime(earlyPreview.calculatedDispatchTimeHours)} ({earlyPreview.transitMinutesFromBay} min prior)
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="23.9"
                  step="0.25"
                  value={pickupHours % 24}
                  onChange={(e) => setPickupHours(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                />
                <p className="text-[11px] text-slate-500">
                  Precision Timed Dispatch: The truck leaves the depot early ({earlyPreview.transitMinutesFromBay} min prior) based on distance to origin ({earlyPreview.distanceToOriginKm} km) so it arrives at {originDP.code} at exactly {formatTime(pickupHours)}.
                </p>
              </div>

              {/* Service Class Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Specialized EV Chassis Configuration
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'standard-dry-van', label: 'Modular Dry Van', desc: 'Enclosed commercial freight' },
                    { id: 'refrigerated-cryo', label: 'Refrigerated Cryo', desc: 'Sub-zero active climate' },
                    { id: 'heavy-duty-flatbed', label: 'Heavy Flatbed Rig', desc: 'Payloads up to 3,800 kg' },
                    { id: 'express-sprinter', label: 'Rapid Sprinter EV', desc: 'Low-drag priority transit' },
                    { id: 'air-ride-vault', label: 'Air-Ride Secure Vault', desc: 'Pneumatic shock suspension' }
                  ].map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setServiceType(s.id as ServiceClass)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        serviceType === s.id
                          ? 'bg-blue-50 border-blue-500 text-blue-900 ring-2 ring-blue-100'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-bold">{s.label}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Extra Services Add-ons */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Custom Value-Added Services
                </label>
                <div className="space-y-2">
                  {EXTRA_SERVICES_CATALOG.map((extra) => (
                    <label
                      key={extra.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        selectedExtras.includes(extra.id)
                          ? 'bg-cyan-50/50 border-cyan-300'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedExtras.includes(extra.id)}
                        onChange={() => handleToggleExtra(extra.id)}
                        className="mt-0.5 rounded-sm accent-cyan-600 cursor-pointer"
                      />
                      <div className="text-xs">
                        <div className="font-bold text-slate-800 flex items-center justify-between">
                          <span>{extra.name}</span>
                          <span className="text-cyan-700 font-mono">
                            {extra.surchargeType === 'percentage' ? `+${extra.percentageVal}%` : `+₹${extra.surchargeAmount}`}
                          </span>
                        </div>
                        <p className="text-slate-500 text-[11px] mt-0.5">{extra.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Truck Allocation */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Fleet Vehicle Allocation
                </label>
                <select
                  value={manualTruckId}
                  onChange={(e) => setManualTruckId(e.target.value === 'auto' ? 'auto' : Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                >
                  <option value="auto">
                    🤖 Auto-Assign Best EV (Recommended: {suggestedTruck ? `${suggestedTruck.name} - ${suggestedTruck.specialization.categoryLabel}` : 'Optimal'})
                  </option>
                  {trucks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.specialization.categoryLabel} · {t.soc.toFixed(0)}% SoC · Max {t.specialization.maxPayloadKg}kg)
                    </option>
                  ))}
                </select>
              </div>

              {/* Special Instructions */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Special Delivery Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={specialNotes}
                  onChange={(e) => setSpecialNotes(e.target.value)}
                  placeholder="e.g. Temperature must be kept at -18°C; call recipient 15 min before arrival"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Live Multi-Stop Tariff Calculation Breakdown */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2">
                <div className="font-bold text-slate-800 border-b border-slate-200 pb-2 mb-2 flex justify-between items-center">
                  <span>Transparent Route &amp; Stop Pricing Breakdown</span>
                  <span className="font-mono text-blue-700">₹{previewPricing.perKmRate}/km · ₹{previewPricing.perKgRate}/kg</span>
                </div>

                {/* Individual Stop Leg Details */}
                {previewPricing.stopBreakdown && previewPricing.stopBreakdown.length > 0 && (
                  <div className="space-y-1.5 pb-2 border-b border-dashed border-slate-200">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Delivery Stops ({previewPricing.stopBreakdown.length} Total Legs):
                    </span>
                    {previewPricing.stopBreakdown.map((sb, i) => (
                      <div key={i} className="flex justify-between items-center text-slate-600 bg-white p-1.5 rounded-md border border-slate-200/60">
                        <span>
                          <strong className="text-slate-800">Stop {i + 1} ({sb.pointName}):</strong> {sb.legDistanceKm} km · {sb.cargoWeightKg} kg
                        </span>
                        <span className="font-mono text-slate-800 font-semibold">₹{sb.stopSubtotal.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between text-slate-600">
                  <span>Total Distance ({previewPricing.distanceKm} km across all legs)</span>
                  <span className="font-mono">₹{previewPricing.baseDistanceFare.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cargo Weight Total ({totalCargoWeightKg} kg)</span>
                  <span className="font-mono">₹{previewPricing.weightFare.toFixed(2)}</span>
                </div>
                {previewPricing.extraServicesFare > 0 && (
                  <div className="flex justify-between text-cyan-700">
                    <span>Add-on Services</span>
                    <span className="font-mono">+₹{previewPricing.extraServicesFare.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500 pt-1 border-t border-dashed border-slate-200">
                  <span>Subtotal</span>
                  <span className="font-mono">₹{previewPricing.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Goods &amp; Services Tax (18% GST)</span>
                  <span className="font-mono">+₹{previewPricing.gstAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total Payable Order Amount</span>
                  <span className="font-mono text-emerald-700 text-base">₹{previewPricing.totalAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Package className="w-4 h-4" />
                  <span>Create &amp; Schedule Order</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
