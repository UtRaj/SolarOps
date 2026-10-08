import React, { useState } from 'react';
import {
  MapPin,
  Navigation,
  Truck as TruckIcon,
  Layers,
  ChevronDown,
  Zap,
  Eye,
  Package,
  Scale,
  Gauge,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
  Info
} from 'lucide-react';
import { DeliveryPoint, Truck, DetailModalContent } from '../types';
import { calculateLegEnergyConsumption } from '../utils/solarPhysics';

interface LogisticsMapProps {
  deliveryPoints: DeliveryPoint[];
  trucks: Truck[];
  onSelectDetail: (content: DetailModalContent) => void;
}

export const LogisticsMap: React.FC<LogisticsMapProps> = ({
  deliveryPoints,
  trucks,
  onSelectDetail
}) => {
  const [focusedTruckId, setFocusedTruckId] = useState<number | 'all'>('all');
  const [pointCategoryFilter, setPointCategoryFilter] = useState<string>('all');

  const categories = Array.from(new Set(deliveryPoints.map((dp) => dp.category)));

  const filteredPoints = deliveryPoints.filter((dp) => {
    if (pointCategoryFilter === 'all') return true;
    return dp.category === pointCategoryFilter;
  });

  const enRouteTrucks = trucks.filter((t) => t.opStatus.startsWith('En Route') || t.opStatus.startsWith('At '));

  // Determine active truck to inspect for telemetry and trip breakdown
  const activeInspectorTruck =
    focusedTruckId !== 'all'
      ? trucks.find((t) => t.id === focusedTruckId)
      : enRouteTrucks[0] || trucks[0];

  return (
    <div className="space-y-4">
      {/* Map Control Toolbar with Dropdowns */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div>
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Navigation className="w-4 h-4 text-blue-600" />
            <span>Interactive 15-Point Regional Logistics &amp; Solar Grid Map</span>
          </h2>
          <p className="text-[11px] text-slate-500">
            Real-time live fleet tracking across 15 delivery points with point-to-point kilometers &amp; cargo weights
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter by Truck Dropdown */}
          <div className="relative inline-block">
            <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">Focus Truck</label>
            <div className="relative">
              <select
                id="map-focus-truck-select"
                value={focusedTruckId}
                onChange={(e) => setFocusedTruckId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-2.5 py-1.5 pr-7 hover:bg-white focus:outline-none cursor-pointer"
              >
                <option value="all">🚚 All Trucks ({trucks.length})</option>
                {trucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.soc.toFixed(0)}% [{t.opStatus}]
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Filter by Category Dropdown */}
          <div className="relative inline-block">
            <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">Point Category</label>
            <div className="relative">
              <select
                id="map-point-category-select"
                value={pointCategoryFilter}
                onChange={(e) => setPointCategoryFilter(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-2.5 py-1.5 pr-7 hover:bg-white focus:outline-none cursor-pointer"
              >
                <option value="all">📍 All 15 Delivery Points</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Visual Vector SVG Map */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative overflow-hidden">
        {/* Map Header Overlay */}
        <div className="absolute top-6 left-6 z-10 bg-white/90 backdrop-blur-xs px-3 py-2 rounded-xl border border-slate-200/80 shadow-xs text-xs space-y-1 max-w-xs">
          <span className="font-bold text-slate-900 block">Metropolitan Electric Transit Grid</span>
          <div className="flex items-center gap-3 text-[11px] text-slate-600">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> Central Depot &amp; Hub
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> 15 Delivery Points
            </span>
          </div>
        </div>

        {/* SVG Canvas */}
        <div className="w-full aspect-[16/9] min-h-[440px] max-h-[620px] bg-slate-50/60 rounded-xl relative border border-slate-100 overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Background Grid Pattern & Arrow Markers */}
            <defs>
              <pattern id="grid-pattern" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e2e8f0" strokeWidth="0.3" strokeDasharray="1 1" />
              </pattern>
              <marker id="arrow-blue" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#2563eb" />
              </marker>
              <marker id="arrow-emerald" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#10b981" />
              </marker>
              <marker id="arrow-slate" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#94a3b8" />
              </marker>
            </defs>
            <rect width="100" height="100" fill="url(#grid-pattern)" />

            {/* Arterial Highway Network Lines */}
            <path d="M 50 10 L 50 90" stroke="#cbd5e1" strokeWidth="0.8" />
            <path d="M 10 50 L 90 50" stroke="#cbd5e1" strokeWidth="0.8" />
            <circle cx="50" cy="50" r="28" fill="none" stroke="#e2e8f0" strokeWidth="0.6" strokeDasharray="2 2" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="0.6" strokeDasharray="2 2" />

            {/* Sequential Active Truck Route Legs (Resolves multi-stop visual bug) */}
            {enRouteTrucks.map((truck) => {
              if (focusedTruckId !== 'all' && truck.id !== focusedTruckId) return null;
              if (!truck.route || !truck.route.legs) return null;

              return (
                <g key={`route-legs-${truck.id}`}>
                  {truck.route.legs.map((leg) => {
                    const isCompleted = leg.legIndex < truck.route!.currentLegIndex;
                    const isActive = leg.legIndex === truck.route!.currentLegIndex;
                    const isUpcoming = leg.legIndex > truck.route!.currentLegIndex;

                    const strokeColor = isActive ? '#2563eb' : isCompleted ? '#10b981' : '#94a3b8';
                    const markerId = isActive ? 'url(#arrow-blue)' : isCompleted ? 'url(#arrow-emerald)' : 'url(#arrow-slate)';
                    const midX = (leg.fromCoords.x + leg.toCoords.x) / 2;
                    const midY = (leg.fromCoords.y + leg.toCoords.y) / 2;

                    return (
                      <g key={`leg-${truck.id}-${leg.legIndex}`}>
                        {/* Leg connecting line */}
                        <line
                          x1={leg.fromCoords.x}
                          y1={leg.fromCoords.y}
                          x2={leg.toCoords.x}
                          y2={leg.toCoords.y}
                          stroke={strokeColor}
                          strokeWidth={isActive ? 1.4 : 0.8}
                          strokeDasharray={isActive ? '3 1.5' : isUpcoming ? '2 2' : 'none'}
                          opacity={isActive ? 0.95 : 0.75}
                          markerEnd={markerId}
                          className={isActive ? 'animate-pulse' : ''}
                        />

                        {/* Midpoint Distance and Weight Badge */}
                        <g transform={`translate(${midX}, ${midY})`}>
                          <rect
                            x="-6"
                            y="-2.2"
                            width="12"
                            height="4.4"
                            rx="1.2"
                            fill="#ffffff"
                            fillOpacity="0.95"
                            stroke={strokeColor}
                            strokeWidth="0.35"
                            className="shadow-xs"
                          />
                          <text
                            x="0"
                            y="-0.2"
                            fontSize="1.6"
                            textAnchor="middle"
                            fontWeight="bold"
                            fill="#0f172a"
                            className="select-none"
                          >
                            {leg.distanceKm} km
                          </text>
                          <text
                            x="0"
                            y="1.5"
                            fontSize="1.2"
                            textAnchor="middle"
                            fontWeight="semibold"
                            fill={leg.cargoWeightKg > 0 ? '#4f46e5' : '#64748b'}
                            className="select-none"
                          >
                            {leg.cargoWeightKg > 0 ? `${(leg.cargoWeightKg / 1000).toFixed(1)}t` : 'Tare 0t'}
                          </text>
                        </g>
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Central Depot Hub Node */}
            <g
              className="cursor-pointer"
              onClick={() =>
                onSelectDetail({
                  type: 'delivery-point',
                  id: 'depot',
                  title: 'Meridian Central Depot & Fleet Microgrid',
                  subtitle: 'Central Hub · Grid Stations 01, 02 & 03 · Fleet Fast Chargers',
                  data: {
                    'Depot Code': 'DEPOT-01',
                    'Address': 'Terminal Blvd, Sector 1',
                    'Active Truck Chargers': '5 Simultaneous DC Fast Bays',
                    'Solar Grid Intertie': 'GS-01 & GS-02 (Trucks), GS-03 (Batteries)',
                    'Super BESS Capacity': '6,000 kWh Omega Unit',
                    'Coordinates': 'Lat: 18.5204, Lng: 73.8567'
                  }
                })
              }
            >
              <circle cx="50" cy="50" r="4.5" fill="#3b82f6" fillOpacity="0.15" />
              <circle cx="50" cy="50" r="2.8" fill="#1d4ed8" stroke="#ffffff" strokeWidth="0.6" />
              <text x="50" y="55" fontSize="2.2" textAnchor="middle" fontWeight="bold" fill="#1e293b">
                Central Depot Hub (GS-01/02/03)
              </text>
            </g>

            {/* 15 Delivery Points */}
            {filteredPoints.map((dp) => (
              <g
                key={dp.id}
                className="cursor-pointer group"
                onClick={() =>
                  onSelectDetail({
                    type: 'delivery-point',
                    id: dp.id,
                    title: `${dp.code}: ${dp.name}`,
                    subtitle: `${dp.category} · ${dp.address}`,
                    data: {
                      'Point Code': dp.code,
                      'Facility Name': dp.name,
                      'Category': dp.category,
                      'Street Address': dp.address,
                      'Typical Cargo': dp.cargoDescription,
                      'Active Logistics Orders': `${dp.activeOrdersCount} Pallets`,
                      'Map Coordinates': `X: ${dp.coords.x}, Y: ${dp.coords.y} (Lat: ${dp.coords.lat}, Lng: ${dp.coords.lng})`
                    }
                  })
                }
              >
                <circle
                  cx={dp.coords.x}
                  cy={dp.coords.y}
                  r="2.2"
                  fill="#f43f5e"
                  stroke="#ffffff"
                  strokeWidth="0.5"
                  className="transition-transform group-hover:scale-125"
                />
                <text
                  x={dp.coords.x}
                  y={dp.coords.y - 3}
                  fontSize="2"
                  textAnchor="middle"
                  fontWeight="bold"
                  fill="#0f172a"
                  className="select-none"
                >
                  {dp.code}
                </text>
              </g>
            ))}

            {/* Animated Truck Markers */}
            {trucks.map((truck) => {
              if (focusedTruckId !== 'all' && truck.id !== focusedTruckId) return null;

              return (
                <g
                  key={`truck-marker-${truck.id}`}
                  className="cursor-pointer group"
                  onClick={() =>
                    onSelectDetail({
                      type: 'truck',
                      id: truck.id,
                      title: `${truck.name} (${truck.plate})`,
                      subtitle: `150 kWh Heavy Logistics EV · ${truck.opStatus}`,
                      data: {
                        'Truck Name': truck.name,
                        'Plate Registration': truck.plate,
                        'Current Status': truck.opStatus,
                        'Battery Power': `${truck.soc.toFixed(1)}%`,
                        'Starting Charge SoC': truck.arrivalSoc !== null ? `${truck.arrivalSoc.toFixed(0)}%` : 'N/A',
                        'Connection Status': truck.connectedToCharger ? `Connected to Bay #${truck.chargerBay}` : 'Disconnected',
                        'Current Coordinates': `X: ${truck.currentCoords.x.toFixed(1)}, Y: ${truck.currentCoords.y.toFixed(1)}`
                      }
                    })
                  }
                >
                  {/* Outer pulse if en route */}
                  {truck.opStatus.startsWith('En Route') && (
                    <circle
                      cx={truck.currentCoords.x}
                      cy={truck.currentCoords.y}
                      r="2.5"
                      fill="#3b82f6"
                      fillOpacity="0.3"
                      className="animate-ping"
                    />
                  )}

                  {/* Truck Dot */}
                  <rect
                    x={truck.currentCoords.x - 1.2}
                    y={truck.currentCoords.y - 1.2}
                    width="2.4"
                    height="2.4"
                    rx="0.5"
                    fill={
                      truck.opStatus === 'Charging (Fast DC)'
                        ? '#10b981'
                        : truck.opStatus.startsWith('En Route')
                        ? '#2563eb'
                        : '#64748b'
                    }
                    stroke="#ffffff"
                    strokeWidth="0.4"
                  />

                  {/* Truck Label */}
                  <text
                    x={truck.currentCoords.x}
                    y={truck.currentCoords.y + 3.2}
                    fontSize="1.7"
                    textAnchor="middle"
                    fontWeight="bold"
                    fill="#1e293b"
                    className="select-none bg-white"
                  >
                    T-{truck.id} ({truck.soc.toFixed(0)}%)
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Live Trip Distance, Route Legs & Cargo Inspector */}
        {activeInspectorTruck && (
          <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                  T-{activeInspectorTruck.id}
                </span>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <span>{activeInspectorTruck.name} ({activeInspectorTruck.plate})</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                      {activeInspectorTruck.opStatus}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Battery: <strong className="text-slate-800">{activeInspectorTruck.soc.toFixed(1)}%</strong> ({((activeInspectorTruck.soc / 100) * activeInspectorTruck.batteryCapacityKwh).toFixed(1)} kWh)
                  </p>
                </div>
              </div>

              {activeInspectorTruck.route ? (
                <div className="flex items-center gap-3 text-xs bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Total Mission Trip:</span>
                    <strong className="text-slate-900 font-mono text-sm">{activeInspectorTruck.route.totalDistanceKm} km</strong>
                  </div>
                  <div className="w-px h-6 bg-slate-200" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Traveled:</span>
                    <strong className="text-blue-600 font-mono text-sm">{activeInspectorTruck.route.distanceCompletedKm?.toFixed(1)} km</strong>
                  </div>
                  <div className="w-px h-6 bg-slate-200" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Remaining:</span>
                    <strong className="text-slate-700 font-mono text-sm">
                      {Math.max(0, activeInspectorTruck.route.totalDistanceKm - (activeInspectorTruck.route.distanceCompletedKm || 0)).toFixed(1)} km
                    </strong>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-slate-400 italic">No active dispatch mission. Truck is at depot.</span>
              )}
            </div>

            {/* Point-to-Point Legs and Weight Breakdown */}
            {activeInspectorTruck.route && activeInspectorTruck.route.legs ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-blue-600" />
                    Point-to-Point Distances &amp; Weight Carried Between Stops
                  </span>
                  <span className="text-[11px] text-indigo-700 font-semibold">
                    📦 {activeInspectorTruck.route.cargoDetails?.initialBoxes || 40} Boxes ({activeInspectorTruck.route.cargoDetails?.totalWeightKg?.toLocaleString() || 1800} kg)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  {activeInspectorTruck.route.legs.map((leg) => {
                    const isCompleted = leg.legIndex < activeInspectorTruck.route!.currentLegIndex;
                    const isActive = leg.legIndex === activeInspectorTruck.route!.currentLegIndex;
                    const { kwh } = calculateLegEnergyConsumption(leg.distanceKm, leg.cargoWeightKg);

                    return (
                      <div
                        key={leg.legIndex}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isActive
                            ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-100 shadow-xs'
                            : isCompleted
                            ? 'bg-emerald-50/60 border-emerald-200 text-slate-700'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-[11px] text-slate-900 flex items-center gap-1">
                            <span
                              className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                                isActive
                                  ? 'bg-blue-600 text-white'
                                  : isCompleted
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {leg.legIndex + 1}
                            </span>
                            Leg {leg.legIndex + 1}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                              isActive
                                ? 'bg-blue-200 text-blue-900 animate-pulse'
                                : isCompleted
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {isActive ? 'Active Leg' : isCompleted ? 'Completed ✓' : 'Upcoming'}
                          </span>
                        </div>

                        <div className="text-[11px] font-semibold text-slate-800 truncate mb-1">
                          {leg.fromName.split(':')[0]} → {leg.toName.split(':')[0]}
                        </div>

                        <div className="space-y-0.5 text-[10px] text-slate-500">
                          <div className="flex justify-between">
                            <span>Distance:</span>
                            <strong className="text-slate-900 font-mono">{leg.distanceKm} km</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Weight to Carry:</span>
                            <strong className={leg.cargoWeightKg > 0 ? 'text-indigo-700 font-mono' : 'text-slate-400'}>
                              {leg.cargoWeightKg > 0 ? `${leg.cargoWeightKg.toLocaleString()} kg (${leg.boxCount} boxes)` : '0 kg (Tare)'}
                            </strong>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-slate-100">
                            <span>Energy Consumed:</span>
                            <span className="font-mono text-slate-700 font-medium">~{kwh} kWh</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Physics and Drainage Model Summary */}
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-600">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      <strong>Realistic Dynamic Battery Drain:</strong> 0.82 kWh/km rolling baseline + 0.16 kWh/km per 1,000 kg cargo mass.
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span>Departure: <strong>{activeInspectorTruck.route.departureSoc.toFixed(0)}%</strong> → Est. Return: <strong>~{activeInspectorTruck.route.estimatedReturnSoc.toFixed(0)}%</strong></span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* 15 Delivery Points Quick Scroller */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              15 Delivery Points Directory (Click to inspect)
            </span>
            <span className="text-xs text-slate-400">All locations active in dispatch network</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs">
            {deliveryPoints.map((dp) => (
              <button
                key={dp.id}
                id={`dp-directory-btn-${dp.id}`}
                onClick={() =>
                  onSelectDetail({
                    type: 'delivery-point',
                    id: dp.id,
                    title: `${dp.code}: ${dp.name}`,
                    subtitle: `${dp.category} · ${dp.address}`,
                    data: {
                      'Point Code': dp.code,
                      'Facility Name': dp.name,
                      'Category': dp.category,
                      'Address': dp.address,
                      'Cargo Demand': dp.cargoDescription,
                      'Active Orders': `${dp.activeOrdersCount} Shipments`
                    }
                  })
                }
                className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-xl text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-mono font-bold text-slate-800 text-[11px]">{dp.code}</span>
                  <span className="text-[9px] text-rose-600 font-semibold">{dp.category.split(' ')[0]}</span>
                </div>
                <span className="text-slate-700 font-medium block truncate text-[11px]">{dp.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
