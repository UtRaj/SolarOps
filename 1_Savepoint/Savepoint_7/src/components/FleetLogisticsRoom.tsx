import React, { useState, useMemo } from 'react';
import {
  Truck as TruckIcon,
  Navigation,
  BatteryCharging,
  Battery,
  MapPin,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Zap,
  ChevronDown,
  Layers,
  ArrowRight,
  ShieldCheck,
  Package,
  Scale,
  Gauge,
  Info
} from 'lucide-react';
import { Truck, DeliveryPoint, DetailModalContent } from '../types';
import { DEPOT_COORDS } from '../data/initialState';
import { BOX_TYPES, generateRouteLegs } from '../data/cargoBoxes';
import { calculateLegEnergyConsumption } from '../utils/solarPhysics';

interface FleetLogisticsRoomProps {
  trucks: Truck[];
  deliveryPoints: DeliveryPoint[];
  onDispatchTruck: (
    truckId: number,
    pickupId: number,
    deliveryIds: number[],
    boxTypeId?: string,
    boxCount?: number
  ) => void;
  onInstantReturnTruck: (truckId: number) => void;
  onSwapTruckBattery: (truckId: number) => void;
  onPlugInTruck: (truckId: number) => void;
  onCompleteChargeTruck: (truckId: number) => void;
  onSelectDetail: (content: DetailModalContent) => void;
  activeChargerCount: number;
}

export const FleetLogisticsRoom: React.FC<FleetLogisticsRoomProps> = ({
  trucks,
  deliveryPoints,
  onDispatchTruck,
  onInstantReturnTruck,
  onSwapTruckBattery,
  onPlugInTruck,
  onCompleteChargeTruck,
  onSelectDetail,
  activeChargerCount
}) => {
  // Dispatch form state
  const [selectedTruckId, setSelectedTruckId] = useState<number>(() => {
    const available = trucks.find((t) => t.opStatus === 'Available at Depot' || t.soc > 30);
    return available ? available.id : 1;
  });

  const [routeTemplate, setRouteTemplate] = useState<'3-point' | '2-point' | 'delivery-only' | '4-point'>('3-point');
  const [pickupPointId, setPickupPointId] = useState<number>(1); // DP-01 Central Warehouse
  const [delivery1Id, setDelivery1Id] = useState<number>(2); // DP-02 North Logistics
  const [delivery2Id, setDelivery2Id] = useState<number>(3); // DP-03 Riverfront
  const [delivery3Id, setDelivery3Id] = useState<number>(6); // DP-06 Airport Cargo

  // Cargo selection state
  const [selectedBoxTypeId, setSelectedBoxTypeId] = useState<string>('industrial');
  const [boxCount, setBoxCount] = useState<number>(40);

  // Filter for trucks list
  const [statusFilter, setStatusFilter] = useState<'all' | 'charging' | 'available' | 'dispatched' | 'queued'>('all');

  const selectedTruck = trucks.find((t) => t.id === selectedTruckId);

  // Compute selected delivery stops based on template
  const getSelectedDeliveryIds = (): number[] => {
    switch (routeTemplate) {
      case '2-point':
        return [delivery1Id];
      case 'delivery-only':
        return [delivery1Id, delivery2Id];
      case '4-point':
        return [delivery1Id, delivery2Id, delivery3Id];
      case '3-point':
      default:
        return [delivery1Id, delivery2Id];
    }
  };

  const selectedBoxConfig = useMemo(() => {
    return BOX_TYPES.find((b) => b.id === selectedBoxTypeId) || BOX_TYPES[0];
  }, [selectedBoxTypeId]);

  const selectedPickup = useMemo(() => {
    return deliveryPoints.find((dp) => dp.id === pickupPointId) || deliveryPoints[0];
  }, [deliveryPoints, pickupPointId]);

  const selectedDeliveries = useMemo(() => {
    const ids = getSelectedDeliveryIds();
    return ids
      .map((did) => deliveryPoints.find((dp) => dp.id === did))
      .filter(Boolean) as DeliveryPoint[];
  }, [deliveryPoints, routeTemplate, delivery1Id, delivery2Id, delivery3Id]);

  // Live Plan generation for previewing distance and weights between every point
  const previewPlan = useMemo(() => {
    return generateRouteLegs(
      DEPOT_COORDS,
      selectedPickup,
      selectedDeliveries,
      selectedBoxConfig,
      boxCount
    );
  }, [selectedPickup, selectedDeliveries, selectedBoxConfig, boxCount]);

  // Total energy and return SoC estimate
  const energyEstimate = useMemo(() => {
    let totalKwh = 0;
    previewPlan.legs.forEach((leg) => {
      const { kwh } = calculateLegEnergyConsumption(leg.distanceKm, leg.cargoWeightKg);
      totalKwh += kwh;
    });
    const batteryCap = selectedTruck?.batteryCapacityKwh || 150;
    const socDrop = (totalKwh / batteryCap) * 100;
    const estReturn = Math.max(5, (selectedTruck?.soc || 100) - socDrop);
    return {
      totalKwh: Number(totalKwh.toFixed(1)),
      socDrop: Number(socDrop.toFixed(1)),
      estReturn: Number(estReturn.toFixed(1))
    };
  }, [previewPlan, selectedTruck]);

  const handleDispatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTruck) return;

    if (selectedTruck.opStatus.startsWith('En Route') || selectedTruck.opStatus.startsWith('At ')) {
      alert(`${selectedTruck.name} is already en route! Select an available or charging truck.`);
      return;
    }

    if (selectedTruck.soc < 20) {
      const confirmLow = window.confirm(
        `${selectedTruck.name} has only ${selectedTruck.soc.toFixed(0)}% battery. Are you sure you want to dispatch without charging?`
      );
      if (!confirmLow) return;
    }

    const deliveryIds = getSelectedDeliveryIds();
    onDispatchTruck(selectedTruckId, pickupPointId, deliveryIds, selectedBoxTypeId, boxCount);
  };

  // Filter trucks
  const filteredTrucks = trucks.filter((t) => {
    if (statusFilter === 'charging') return t.opStatus === 'Charging (Fast DC)';
    if (statusFilter === 'available') return t.opStatus === 'Available at Depot';
    if (statusFilter === 'queued') return t.opStatus === 'Queued for Charger';
    if (statusFilter === 'dispatched') return t.opStatus.startsWith('En Route') || t.opStatus.startsWith('At ');
    return true;
  });

  const chargingTrucks = trucks.filter((t) => t.opStatus === 'Charging (Fast DC)');
  const queuedTrucks = trucks.filter((t) => t.opStatus === 'Queued for Charger');
  const enRouteTrucks = trucks.filter((t) => t.opStatus.startsWith('En Route') || t.opStatus.startsWith('At '));

  return (
    <div className="space-y-6">
      {/* Top Banner & 5-Charger Limit Rule Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <TruckIcon className="w-5 h-5 text-blue-600" />
              <span>Electric Fleet Hub &amp; Multi-Stop Dispatch</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              10 Heavy-Duty EV Trucks · 15 Regional Delivery Points · <strong>Strict 5-Truck Simultaneous Charging Ceiling</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
              <BatteryCharging className="w-4 h-4 text-emerald-600" />
              <span>Charging Bays: {chargingTrucks.length}/5 Used</span>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Queued for Bays: {queuedTrucks.length} Trucks</span>
            </div>

            <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
              <Navigation className="w-4 h-4 text-blue-600" />
              <span>In Transit (Disconnected): {enRouteTrucks.length}</span>
            </div>
          </div>
        </div>

        {/* Real-life Policy Rule Banner */}
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-slate-800">Operational Charging &amp; Dispatch Protocol:</p>
            <p className="text-slate-500">
              1. Dispatched trucks immediately disconnect and show <strong>0 kW draw</strong> while en route.
              <br />
              2. When a truck finishes deliveries and returns (e.g. at <strong>21%</strong> or <strong>63%</strong>), charging starts from that exact percentage up to 100%.
              <br />
              3. Maximum <strong>5 trucks</strong> charge simultaneously. When any of the 5 completes charging to 100%, the 6th queued truck automatically takes the charger.
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Column = Multi-Stop Dispatch Planner, Right Column = 5 Charging Bays & Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Dispatch Planner with Dropdowns (5 Cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-blue-600" />
                <span>Multi-Stop Route Dispatcher</span>
              </h3>
              <p className="text-[11px] text-slate-500">Dispatch any of the 10 trucks to any of the 15 points</p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-200">
              15 Points Total
            </span>
          </div>

          <form onSubmit={handleDispatchSubmit} className="space-y-3.5 text-xs">
            {/* 1. Truck Selector Dropdown (prominently showing current power %) */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Select Truck (with Current Power %):
              </label>
              <div className="relative">
                <select
                  id="dispatch-truck-select"
                  value={selectedTruckId}
                  onChange={(e) => setSelectedTruckId(Number(e.target.value))}
                  className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-800 font-bold rounded-xl px-3 py-2.5 pr-8 hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                >
                  {trucks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.plate}) — {t.soc.toFixed(0)}% Battery · [{t.opStatus}]
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              {selectedTruck && (
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 px-1">
                  <span>Current State: <strong className="text-slate-700">{selectedTruck.opStatus}</strong></span>
                  <span>Power: <strong className="text-blue-600">{selectedTruck.soc.toFixed(1)}% ({((selectedTruck.soc / 100) * selectedTruck.batteryCapacityKwh).toFixed(0)} kWh)</strong></span>
                </div>
              )}
            </div>

            {/* 2. Route Sequence Template Selector */}
            <div>
              <label className="font-semibold text-slate-700 block mb-1">
                Delivery Sequence Template:
              </label>
              <div className="relative">
                <select
                  id="route-template-select"
                  value={routeTemplate}
                  onChange={(e) => setRouteTemplate(e.target.value as any)}
                  className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-800 font-medium rounded-xl px-3 py-2 pr-8 hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="3-point">Standard: Pickup → Delivery 1 → Delivery 2 → Depot</option>
                  <option value="2-point">Direct: Pickup → Delivery 1 → Depot</option>
                  <option value="delivery-only">Inter-Delivery: Delivery 1 → Delivery 2 → Depot</option>
                  <option value="4-point">Extended: Pickup → Delivery 1 → Delivery 2 → Delivery 3 → Depot</option>
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 3. Stop 1: Pickup Point Dropdown */}
            {routeTemplate !== 'delivery-only' && (
              <div className="p-2.5 bg-blue-50/50 rounded-xl border border-blue-100 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
                  Stop 1: Cargo Pickup Location
                </span>
                <div className="relative">
                  <select
                    id="pickup-point-select"
                    value={pickupPointId}
                    onChange={(e) => setPickupPointId(Number(e.target.value))}
                    className="w-full appearance-none bg-white border border-blue-200 text-slate-800 font-semibold rounded-lg px-2.5 py-1.5 pr-7 hover:border-blue-400 focus:outline-none cursor-pointer"
                  >
                    {deliveryPoints.map((dp) => (
                      <option key={dp.id} value={dp.id}>
                        {dp.code}: {dp.name} ({dp.category})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-blue-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {/* 4. Stop 2: Delivery Point 1 */}
            <div className="p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                {routeTemplate === 'delivery-only' ? 'Origin Delivery Point 1' : 'Stop 2: Delivery Point 1'}
              </span>
              <div className="relative">
                <select
                  id="delivery-point-1-select"
                  value={delivery1Id}
                  onChange={(e) => setDelivery1Id(Number(e.target.value))}
                  className="w-full appearance-none bg-white border border-emerald-200 text-slate-800 font-semibold rounded-lg px-2.5 py-1.5 pr-7 hover:border-emerald-400 focus:outline-none cursor-pointer"
                >
                  {deliveryPoints.map((dp) => (
                    <option key={dp.id} value={dp.id}>
                      {dp.code}: {dp.name} — {dp.cargoDescription.slice(0, 32)}...
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-emerald-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 5. Stop 3: Delivery Point 2 (if 3-point or 4-point or delivery-only) */}
            {(routeTemplate === '3-point' || routeTemplate === '4-point' || routeTemplate === 'delivery-only') && (
              <div className="p-2.5 bg-purple-50/50 rounded-xl border border-purple-100 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">
                  {routeTemplate === 'delivery-only' ? 'Destination Delivery Point 2' : 'Stop 3: Delivery Point 2'}
                </span>
                <div className="relative">
                  <select
                    id="delivery-point-2-select"
                    value={delivery2Id}
                    onChange={(e) => setDelivery2Id(Number(e.target.value))}
                    className="w-full appearance-none bg-white border border-purple-200 text-slate-800 font-semibold rounded-lg px-2.5 py-1.5 pr-7 hover:border-purple-400 focus:outline-none cursor-pointer"
                  >
                    {deliveryPoints.map((dp) => (
                      <option key={dp.id} value={dp.id}>
                        {dp.code}: {dp.name} — {dp.cargoDescription.slice(0, 32)}...
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-purple-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {/* 6. Stop 4: Delivery Point 3 (if 4-point) */}
            {routeTemplate === '4-point' && (
              <div className="p-2.5 bg-amber-50/50 rounded-xl border border-amber-100 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
                  Stop 4: Delivery Point 3
                </span>
                <div className="relative">
                  <select
                    id="delivery-point-3-select"
                    value={delivery3Id}
                    onChange={(e) => setDelivery3Id(Number(e.target.value))}
                    className="w-full appearance-none bg-white border border-amber-200 text-slate-800 font-semibold rounded-lg px-2.5 py-1.5 pr-7 hover:border-amber-400 focus:outline-none cursor-pointer"
                  >
                    {deliveryPoints.map((dp) => (
                      <option key={dp.id} value={dp.id}>
                        {dp.code}: {dp.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-amber-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {/* 7. Cargo Specification: Box Type & Total Boxes */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-indigo-600" />
                  Cargo Type &amp; Weight Assignment
                </span>
                <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                  {previewPlan.totalInitialWeightKg.toLocaleString()} kg Total
                </span>
              </div>

              {/* Box Type Selector */}
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                  Select Cargo / Box Classification:
                </label>
                <div className="relative">
                  <select
                    id="cargo-box-type-select"
                    value={selectedBoxTypeId}
                    onChange={(e) => setSelectedBoxTypeId(e.target.value)}
                    className="w-full appearance-none bg-white border border-slate-300 text-slate-800 font-semibold rounded-lg px-2.5 py-1.5 pr-7 hover:border-indigo-400 focus:outline-none cursor-pointer text-xs"
                  >
                    {BOX_TYPES.map((box) => (
                      <option key={box.id} value={box.id}>
                        {box.name} ({box.unitWeightKg} kg/box)
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">{selectedBoxConfig.description}</p>
              </div>

              {/* Quantity / Count */}
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-600 font-medium">Quantity to Dispatch:</span>
                  <span className="font-bold font-mono text-slate-900">{boxCount} Boxes ({selectedBoxConfig.unitWeightKg * boxCount} kg)</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={120}
                  step={5}
                  value={boxCount}
                  onChange={(e) => setBoxCount(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
                <div className="flex items-center gap-1.5 mt-1">
                  {[20, 40, 60, 80, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBoxCount(preset)}
                      className={`flex-1 py-0.5 text-[10px] font-bold rounded border transition-colors ${
                        boxCount === preset
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 8. Sequential Route Legs & Kilometers Table */}
            <div className="p-3 bg-blue-50/40 rounded-xl border border-blue-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-900 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-blue-600" />
                  Route Legs &amp; Point-to-Point Distances
                </span>
                <span className="text-[10px] font-bold font-mono text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded">
                  {previewPlan.totalDistanceKm} km Total
                </span>
              </div>

              <div className="space-y-1.5">
                {previewPlan.legs.map((leg) => {
                  const { kwh } = calculateLegEnergyConsumption(leg.distanceKm, leg.cargoWeightKg);
                  return (
                    <div
                      key={leg.legIndex}
                      className="bg-white p-2 rounded-lg border border-slate-200 flex items-center justify-between text-[11px] gap-2 shadow-2xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-800 text-[10px] flex items-center justify-center font-mono">
                            {leg.legIndex + 1}
                          </span>
                          <span className="truncate">{leg.fromName.split(':')[0]} → {leg.toName.split(':')[0]}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 pl-5.5">
                          {leg.cargoWeightKg > 0 ? (
                            <span className="text-indigo-600 font-medium">Carrying {leg.boxCount} boxes ({leg.cargoWeightKg.toLocaleString()} kg)</span>
                          ) : (
                            <span className="text-slate-400">Tare: 0 kg (Empty transit)</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-slate-900 text-xs block">{leg.distanceKm} km</span>
                        <span className="text-[10px] font-mono text-slate-500">~{kwh} kWh</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total Trip Metrics Banner */}
              <div className="bg-white/80 p-2.5 rounded-lg border border-blue-100 grid grid-cols-3 gap-2 text-center text-[10px]">
                <div>
                  <span className="text-slate-400 block font-medium">Total Distance</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">{previewPlan.totalDistanceKm} km</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Est. Battery Drain</span>
                  <span className="font-mono font-bold text-rose-600 text-xs">-{energyEstimate.socDrop}%</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Return Power</span>
                  <span className="font-mono font-bold text-emerald-600 text-xs">~{energyEstimate.estReturn}%</span>
                </div>
              </div>
              <p className="text-[9px] text-slate-400 italic">
                * Realistic battery drainage calculated from distance traveled and cargo weight (0.82 kWh/km + 0.16 kWh/km per 1,000 kg).
              </p>
            </div>

            {/* Final Return: Central Depot / Charging Station */}
            <div className="p-2.5 bg-slate-100/80 rounded-xl border border-slate-200 flex items-center justify-between text-slate-700">
              <div className="flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-semibold">Final Return: Central Charging Station</span>
              </div>
              <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                Auto Re-enters Bay / Queue
              </span>
            </div>

            {/* Dispatch Button */}
            <button
              id="dispatch-truck-submit-btn"
              type="submit"
              disabled={!selectedTruck || selectedTruck.opStatus.startsWith('En Route')}
              className={`w-full py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-all ${
                !selectedTruck || selectedTruck.opStatus.startsWith('En Route')
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-[0.99]'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>
                Dispatch {selectedTruck?.name || 'Truck'} ({previewPlan.totalDistanceKm} km · {previewPlan.totalInitialWeightKg.toLocaleString()} kg)
              </span>
            </button>
          </form>
        </div>

        {/* Right Column: 5 Charging Bays & Queued Section (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* 5 Simultaneous Charging Bays Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-emerald-600" />
                  <span>Depot Fast-DC Charging Bays (Max 5 Limit)</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Powered by GS-01 &amp; GS-02 · Exactly 5 bays can charge at once
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                {chargingTrucks.length} of 5 Bays Active
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
              {[1, 2, 3, 4, 5].map((bayNumber) => {
                const truckInBay = chargingTrucks.find((t) => t.chargerBay === bayNumber);

                return (
                  <div
                    key={bayNumber}
                    id={`charging-bay-${bayNumber}`}
                    className={`rounded-xl border p-3 flex flex-col justify-between transition-all ${
                      truckInBay
                        ? 'bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-200'
                        : 'bg-slate-50 border-dashed border-slate-300 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-[10px] font-bold uppercase text-slate-500">
                        Bay #{bayNumber}
                      </span>
                      {truckInBay ? (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-slate-300" />
                      )}
                    </div>

                    {truckInBay ? (
                      <div>
                        <div className="font-bold text-xs text-slate-900 leading-tight">
                          {truckInBay.name}
                        </div>
                        <div className="font-mono text-sm font-extrabold text-emerald-700 mt-1">
                          {truckInBay.soc.toFixed(1)}%
                        </div>
                        <div className="w-full bg-emerald-200/70 h-1.5 rounded-full overflow-hidden my-1">
                          <div
                            className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                            style={{ width: `${truckInBay.soc}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {truckInBay.arrivalSoc !== null && (
                            <span className="block text-slate-600">
                              From {truckInBay.arrivalSoc.toFixed(0)}%
                            </span>
                          )}
                          <span className="font-semibold text-emerald-800">
                            +{truckInBay.chargeRateKw} kW DC
                          </span>
                        </div>
                        <button
                          id={`finish-charge-bay-${bayNumber}-btn`}
                          onClick={() => onCompleteChargeTruck(truckInBay.id)}
                          className="mt-2 w-full py-1 text-[9px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded border border-emerald-300 transition-colors cursor-pointer"
                          title="Simulate 100% full charge now (frees bay and promotes next queued truck)"
                        >
                          ⚡ Complete (100%)
                        </button>
                      </div>
                    ) : (
                      <div className="py-4 text-center">
                        <span className="text-[11px] font-medium block">Bay Empty</span>
                        <span className="text-[9px] text-slate-400">Ready for Truck</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Queue Section for 6th+ Trucks */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-amber-500" />
                <span>Charger Waiting Queue ({queuedTrucks.length} Trucks Queued)</span>
              </h4>
              <span className="text-[10px] text-slate-400">
                Auto-promotes when any bay reaches 100% full
              </span>
            </div>

            {queuedTrucks.length === 0 ? (
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center text-xs text-slate-500">
                All returned trucks currently have access to a charging bay. Queue is clear!
              </div>
            ) : (
              <div className="space-y-2">
                {queuedTrucks.map((truck, idx) => (
                  <div
                    key={truck.id}
                    id={`queued-truck-${truck.id}`}
                    className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 font-mono font-bold text-[10px] flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <div>
                        <span className="font-bold text-slate-900">{truck.name}</span>
                        <span className="text-slate-500 text-[11px] ml-1.5">({truck.plate})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-amber-900">
                        {truck.soc.toFixed(1)}% Power
                      </span>
                      <button
                        id={`prioritize-queue-truck-${truck.id}-btn`}
                        onClick={() => onPlugInTruck(truck.id)}
                        className="px-2 py-1 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
                        title="Allocate to free bay if available"
                      >
                        ⚡ Prioritize
                      </button>
                      <button
                        onClick={() => onSwapTruckBattery(truck.id)}
                        className="px-2 py-1 bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
                        title="Instant Battery Swap from Rack instead of waiting in queue"
                      >
                        ⚡ Swap (100%)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Complete 10 Trucks Fleet Table / Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-600" />
              <span>All 10 Heavy-Duty Fleet Trucks</span>
            </h3>
            <p className="text-xs text-slate-500">Click any truck card to inspect detailed onboard telemetry &amp; battery health</p>
          </div>

          {/* Status Filter Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Filter Status:</span>
            <div className="relative">
              <select
                id="fleet-status-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-3 py-1.5 pr-8 hover:bg-white focus:outline-none cursor-pointer"
              >
                <option value="all">🚚 All 10 Trucks</option>
                <option value="charging">⚡ Charging Bays (Max 5)</option>
                <option value="queued">⏳ Queued for Bay</option>
                <option value="dispatched">🛣️ In Transit (Disconnected)</option>
                <option value="available">🟢 Ready at Depot</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {filteredTrucks.map((truck) => {
            const isCharging = truck.opStatus === 'Charging (Fast DC)';
            const isEnRoute = truck.opStatus.startsWith('En Route') || truck.opStatus.startsWith('At ');
            const isQueued = truck.opStatus === 'Queued for Charger';
            const isAvailable = truck.opStatus === 'Available at Depot';

            return (
              <div
                key={truck.id}
                id={`fleet-truck-card-${truck.id}`}
                onClick={() =>
                  onSelectDetail({
                    type: 'truck',
                    id: truck.id,
                    title: `${truck.name} (${truck.plate})`,
                    subtitle: `150 kWh Heavy Logistics EV · ${truck.opStatus}`,
                    data: {
                      'Truck Name': truck.name,
                      'Plate Registration': truck.plate,
                      'Current State': truck.opStatus,
                      'Battery Power': `${truck.soc.toFixed(1)}% (${((truck.soc / 100) * truck.batteryCapacityKwh).toFixed(1)} kWh)`,
                      'Starting Charge SoC': truck.arrivalSoc !== null ? `${truck.arrivalSoc.toFixed(0)}% (Starts charging from arrival %)` : 'N/A',
                      'Charger Connection': truck.connectedToCharger ? `Connected to Bay #${truck.chargerBay}` : 'Disconnected (0 kW draw)',
                      'Charge Infeed': isCharging ? `${truck.chargeRateKw} kW Fast DC` : '0 kW',
                      'Total Route Deliveries Completed': `${truck.totalDeliveriesCompleted} Deliveries`,
                      'Motor Temperature': `${truck.motorTempC.toFixed(1)} °C`,
                      'Current Coordinates': `Lat: ${truck.currentCoords.lat.toFixed(4)}, Lng: ${truck.currentCoords.lng.toFixed(4)}`
                    }
                  })
                }
                className={`bg-white border rounded-xl p-3.5 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between ${
                  isCharging
                    ? 'border-emerald-300 ring-1 ring-emerald-100'
                    : isEnRoute
                    ? 'border-blue-300 ring-1 ring-blue-100 bg-blue-50/20'
                    : isQueued
                    ? 'border-amber-300 bg-amber-50/30'
                    : 'border-slate-200'
                }`}
              >
                {/* Header */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs text-slate-900">{truck.name}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                        isCharging
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : isEnRoute
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : isQueued
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {isCharging
                        ? `Bay #${truck.chargerBay}`
                        : isEnRoute
                        ? 'In Transit'
                        : isQueued
                        ? 'Queued'
                        : 'Ready'}
                    </span>
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono block mb-1">{truck.plate}</span>

                  {/* Truck Specialization Badge */}
                  {truck.specialization && (
                    <div className="mb-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        truck.specialization.serviceType === 'cold-chain'
                          ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                          : truck.specialization.serviceType === 'heavy-haul'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : truck.specialization.serviceType === 'express-rapid'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : truck.specialization.serviceType === 'fragile-secure'
                          ? 'bg-purple-50 text-purple-800 border-purple-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}>
                        <span>{truck.specialization.serviceType === 'cold-chain' ? '❄️' : truck.specialization.serviceType === 'heavy-haul' ? '🏗️' : truck.specialization.serviceType === 'express-rapid' ? '⚡' : truck.specialization.serviceType === 'fragile-secure' ? '🛡️' : '📦'}</span>
                        <span className="truncate">{truck.specialization.categoryLabel}</span>
                      </span>
                      <div className="text-[9px] text-slate-400 mt-0.5">
                        Max Payload: {truck.specialization.maxPayloadKg.toLocaleString()} kg · {truck.specialization.specialEquipment[0] || 'Fleet Rig'}
                      </div>
                    </div>
                  )}

                  {/* Battery Level Indicator */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500 font-medium">Power:</span>
                      <span className="font-mono font-bold text-slate-900">{truck.soc.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          truck.soc > 60
                            ? 'bg-emerald-500'
                            : truck.soc > 25
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${truck.soc}%` }}
                      />
                    </div>
                  </div>

                  {/* Operational status text */}
                  <div className="mt-2.5 text-[11px] text-slate-600 line-clamp-1 font-medium">
                    {truck.opStatus}
                  </div>

                  {/* En Route Live Mission Progress (Legs, Kilometers, Cargo) */}
                  {isEnRoute && truck.route && (
                    <div className="mt-2 p-2 bg-blue-50/70 rounded-lg border border-blue-200/60 space-y-1.5 text-[10px]">
                      <div className="flex items-center justify-between text-blue-900 font-bold">
                        <span>Leg {(truck.route.currentLegIndex || 0) + 1} of {truck.route.legs?.length || 3}</span>
                        <span>{truck.route.legs?.[truck.route.currentLegIndex || 0]?.distanceKm || 0} km</span>
                      </div>
                      <div className="text-[9px] text-slate-600 truncate">
                        {truck.route.legs?.[truck.route.currentLegIndex || 0]?.fromName.split(':')[0]} → {truck.route.legs?.[truck.route.currentLegIndex || 0]?.toName.split(':')[0]}
                      </div>
                      <div className="text-[9px] text-indigo-700 font-semibold truncate">
                        📦 {truck.currentCargo || 'In Transit'}
                      </div>
                      <div className="space-y-0.5 pt-0.5">
                        <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                          <span>Traveled:</span>
                          <span>{truck.route.distanceCompletedKm?.toFixed(1)} / {truck.route.totalDistanceKm?.toFixed(1)} km</span>
                        </div>
                        <div className="w-full bg-blue-200/50 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-blue-600 h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(100, Math.round(((truck.route.distanceCompletedKm || 0) / (truck.route.totalDistanceKm || 1)) * 100))}%`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Verification note: starting arrival SoC */}
                  {truck.arrivalSoc !== null && (
                    <div className="text-[10px] text-emerald-700 font-medium mt-0.5">
                      Charging started at {truck.arrivalSoc.toFixed(0)}%
                    </div>
                  )}

                  {/* Connection indicator */}
                  <div className="mt-1 text-[10px]">
                    {truck.connectedToCharger ? (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Connected ({truck.chargeRateKw} kW)
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium">
                        Disconnected (0 kW)
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Actions (Swap pack, Plug in, Complete, or Return) */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-1" onClick={(e) => e.stopPropagation()}>
                  {isEnRoute ? (
                    <button
                      onClick={() => onInstantReturnTruck(truck.id)}
                      className="w-full py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
                      title="Simulate immediate return to depot"
                    >
                      ↩ Return to Depot
                    </button>
                  ) : isCharging ? (
                    <div className="flex items-center gap-1 w-full">
                      <button
                        onClick={() => onCompleteChargeTruck(truck.id)}
                        className="w-full py-1 text-[10px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 rounded-md transition-colors"
                        title="Simulate 100% full charge now (frees bay and allocates next queued truck)"
                      >
                        ⚡ Complete (100%)
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 w-full">
                      <button
                        onClick={() => onPlugInTruck(truck.id)}
                        className="w-1/2 py-1 text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md transition-colors"
                        title="Plug into charging bay (or queue if all 5 busy)"
                      >
                        🔌 Plug In
                      </button>
                      <button
                        onClick={() => onSwapTruckBattery(truck.id)}
                        className="w-1/2 py-1 text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md transition-colors"
                        title="Instant 100% Battery Pack Swap"
                      >
                        ⚡ Swap
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
