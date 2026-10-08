import React from 'react';
import {
  Sun,
  Truck,
  Battery,
  Zap,
  Moon,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Navigation,
  Sliders,
  AlertCircle
} from 'lucide-react';
import { GridStation, SolarFarm, Truck as TruckType, BatteryPack, SuperBattery, DetailModalContent, ViewTab } from '../types';

interface OverviewDashboardProps {
  stations: GridStation[];
  farms: SolarFarm[];
  trucks: TruckType[];
  packs: BatteryPack[];
  superBattery: SuperBattery;
  onNavigateTab: (tab: ViewTab) => void;
  onToggleGrid3: () => void;
  onSelectDetail: (content: DetailModalContent) => void;
  isNight: boolean;
  totalSolarKw: number;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  stations,
  farms,
  trucks,
  packs,
  superBattery,
  onNavigateTab,
  onToggleGrid3,
  onSelectDetail,
  isNight,
  totalSolarKw
}) => {
  const chargingTrucks = trucks.filter((t) => t.opStatus === 'Charging (Fast DC)');
  const queuedTrucks = trucks.filter((t) => t.opStatus === 'Queued for Charger');
  const enRouteTrucks = trucks.filter((t) => t.opStatus.startsWith('En Route') || t.opStatus.startsWith('At '));
  const availableTrucks = trucks.filter((t) => t.opStatus === 'Available at Depot');

  const readyPacks = packs.filter((p) => p.soc >= 99);
  const chargingPacks = packs.filter((p) => p.charging && p.soc < 100);

  const gs1 = stations.find((s) => s.id === 1);
  const gs2 = stations.find((s) => s.id === 2);
  const gs3 = stations.find((s) => s.id === 3);

  const totalPanels = farms.reduce((sum, f) => sum + f.panels, 0);

  return (
    <div className="space-y-6">
      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Solar Generation */}
        <div
          id="kpi-solar-card"
          onClick={() => onNavigateTab('solar-grid')}
          className="bg-white border border-slate-200 hover:border-amber-300 rounded-2xl p-5 shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Microgrid Solar Output
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 group-hover:scale-105 transition-transform">
              <Sun className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {totalSolarKw.toFixed(1)} <span className="text-sm font-bold text-slate-500">kW</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>9 Arrays ({totalPanels} Panels)</span>
            <span className="text-amber-700 font-semibold text-[11px]">2-3 Stations</span>
          </div>
        </div>

        {/* 2. Fleet Charging Bays (Max 5) */}
        <div
          id="kpi-fleet-card"
          onClick={() => onNavigateTab('fleet')}
          className="bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-5 shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Fleet Fast Chargers
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200 group-hover:scale-105 transition-transform">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {chargingTrucks.length} <span className="text-sm font-bold text-slate-500">/ 5 Active Bays</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>{queuedTrucks.length} Queued · {enRouteTrucks.length} In Transit</span>
            <span className="text-blue-700 font-semibold text-[11px]">10 Trucks</span>
          </div>
        </div>

        {/* 3. Battery Swap Station (15 Packs) */}
        <div
          id="kpi-battery-card"
          onClick={() => onNavigateTab('battery')}
          className="bg-white border border-slate-200 hover:border-purple-300 rounded-2xl p-5 shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Battery Swap Hub
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200 group-hover:scale-105 transition-transform">
              <Battery className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {readyPacks.length} <span className="text-sm font-bold text-slate-500">/ 15 Ready Packs</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>GS-03: {gs3?.active ? 'Online' : 'Standby'}</span>
            <span className="text-purple-700 font-semibold text-[11px]">{chargingPacks.length} Charging</span>
          </div>
        </div>

        {/* 4. Super High-Capacity BESS */}
        <div
          id="kpi-super-bess-card"
          onClick={() => onNavigateTab('battery')}
          className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-5 shadow-xs transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Super High-Capacity BESS
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200 group-hover:scale-105 transition-transform">
              {isNight ? <Moon className="w-4 h-4 text-indigo-600" /> : <Zap className="w-4 h-4 text-indigo-600" />}
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {superBattery.storedKwh.toFixed(0)} <span className="text-sm font-bold text-slate-500">/ 6,000 kWh</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>{isNight ? 'Night Reserve Active' : 'Day Buffer'}</span>
            <span className="text-indigo-700 font-semibold text-[11px] font-mono">{superBattery.soc.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Architectural Separation Diagram (Prompt Requirement 5) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <span>Microgrid Power Distribution &amp; Fleet Logistics Flow</span>
            </h3>
            <p className="text-xs text-slate-500">
              Independent routing channels ensure truck charging loads never interfere with battery swap operations.
            </p>
          </div>

          <span className="text-xs font-semibold text-slate-400 hidden sm:inline">
            Real SCADA Architecture
          </span>
        </div>

        {/* 3 Intertied Channels */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Channel A: GS-01 (Trucks) */}
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800">GS-01 · Northern Grid</span>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">Fleet Power</span>
            </div>
            <p className="text-[11px] text-slate-600">
              Connected to <strong>Farms 01, 02, 03</strong> (60–120 panels each). Infeeds directly into Central Depot Fast DC Chargers.
            </p>
            <div className="flex justify-between text-xs font-mono pt-1 text-slate-700">
              <span>Solar: {gs1?.currentSolarInputKw.toFixed(1)} kW</span>
              <span>Buffer: {gs1?.bessSocPct}%</span>
            </div>
          </div>

          {/* Channel B: GS-02 (Trucks) */}
          <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800">GS-02 · Southern Grid</span>
              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">Fleet Power</span>
            </div>
            <p className="text-[11px] text-slate-600">
              Connected to <strong>Farms 04, 05, 06</strong> (60–120 panels each). Jointly powers the 5 active truck charging bays.
            </p>
            <div className="flex justify-between text-xs font-mono pt-1 text-slate-700">
              <span>Solar: {gs2?.currentSolarInputKw.toFixed(1)} kW</span>
              <span>Buffer: {gs2?.bessSocPct}%</span>
            </div>
          </div>

          {/* Channel C: GS-03 (Dedicated to Batteries) */}
          <div className={`p-4 rounded-xl border space-y-2 transition-all ${
            gs3?.active ? 'border-purple-200 bg-purple-50/30' : 'border-slate-200 bg-slate-50 opacity-80'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-slate-800">GS-03 · Dedicated Battery Station</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                gs3?.active ? 'text-purple-700 bg-purple-100' : 'text-slate-500 bg-slate-200'
              }`}>
                {gs3?.active ? 'Active (Batteries)' : 'Standby'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600">
              Connected to <strong>Farms 07, 08, 09</strong>. Powers the 15-pack modular rack. Super Battery buffers night swaps (17:00–07:00).
            </p>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-mono text-slate-700">
                Solar: {gs3?.active ? `${gs3?.currentSolarInputKw.toFixed(1)} kW` : '0.0 kW'}
              </span>
              <button
                onClick={onToggleGrid3}
                className="text-[10px] font-bold text-purple-700 hover:text-purple-900 underline cursor-pointer"
              >
                {gs3?.active ? 'Deactivate GS-03' : 'Activate GS-03'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Access Action Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <button
          onClick={() => onNavigateTab('fleet')}
          className="p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-left shadow-xs transition-all flex items-center justify-between group cursor-pointer"
        >
          <div>
            <span className="font-bold text-slate-900 block text-sm mb-0.5">
              Launch Dispatch Planner
            </span>
            <span className="text-slate-500">Dispatch truck to 15 delivery points</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
        </button>

        <button
          onClick={() => onNavigateTab('solar-grid')}
          className="p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-left shadow-xs transition-all flex items-center justify-between group cursor-pointer"
        >
          <div>
            <span className="font-bold text-slate-900 block text-sm mb-0.5">
              Adjust Solar Panel Counts
            </span>
            <span className="text-slate-500">Scale arrays from 60 to 120 panels</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all" />
        </button>

        <button
          onClick={() => onNavigateTab('battery')}
          className="p-4 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-left shadow-xs transition-all flex items-center justify-between group cursor-pointer"
        >
          <div>
            <span className="font-bold text-slate-900 block text-sm mb-0.5">
              Execute Battery Swap
            </span>
            <span className="text-slate-500">Instant 100% pack exchange for trucks</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all" />
        </button>
      </div>
    </div>
  );
};
