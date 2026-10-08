import React, { useState } from 'react';
import {
  Sun,
  Zap,
  Sliders,
  Power,
  ChevronDown,
  Info,
  CheckCircle2,
  AlertCircle,
  Battery,
  Layers,
  ArrowRight,
  TrendingUp
} from 'lucide-react';
import { GridStation, SolarFarm, DetailModalContent } from '../types';

interface SolarGridRoomProps {
  stations: GridStation[];
  farms: SolarFarm[];
  onToggleGrid3: () => void;
  onUpdateFarmPanels: (farmId: number, panels: number) => void;
  onSelectDetail: (content: DetailModalContent) => void;
  totalSolarOutputKw: number;
  totalFleetPowerDrawnKw: number;
  totalBatteryRackDrawnKw: number;
}

export const SolarGridRoom: React.FC<SolarGridRoomProps> = ({
  stations,
  farms,
  onToggleGrid3,
  onUpdateFarmPanels,
  onSelectDetail,
  totalSolarOutputKw,
  totalFleetPowerDrawnKw,
  totalBatteryRackDrawnKw
}) => {
  const [stationFilter, setStationFilter] = useState<'all' | '1' | '2' | '3'>('all');
  const [farmFilter, setFarmFilter] = useState<string>('all');

  const filteredStations = stations.filter((s) => {
    if (stationFilter === 'all') return true;
    return s.id.toString() === stationFilter;
  });

  const filteredFarms = farms.filter((f) => {
    if (farmFilter !== 'all' && f.id.toString() !== farmFilter) return false;
    if (stationFilter !== 'all' && f.stationId.toString() !== stationFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Filter & Separation Notice */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sun className="w-5 h-5 text-amber-500" />
              <span>Solar Grid Stations &amp; Generation Arrays</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Strict Electrical Separation: <strong>GS-01 &amp; GS-02</strong> power electric truck charging (max 5
              active) · <strong>GS-03</strong> is dedicated to battery swap charging.
            </p>
          </div>

          {/* Clean Dropdown Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative inline-block">
              <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">Filter Station</label>
              <div className="relative">
                <select
                  id="station-filter-select"
                  value={stationFilter}
                  onChange={(e) => setStationFilter(e.target.value as any)}
                  className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-3 py-1.5 pr-8 hover:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="all">⚡ All Grid Stations (3 Total)</option>
                  <option value="1">GS-01: Northern Fleet Infeed</option>
                  <option value="2">GS-02: Southern Fleet Infeed</option>
                  <option value="3">GS-03: Dedicated Battery Infeed</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="relative inline-block">
              <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-0.5">Quick Inspect Farm</label>
              <div className="relative">
                <select
                  id="farm-filter-select"
                  value={farmFilter}
                  onChange={(e) => setFarmFilter(e.target.value)}
                  className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-3 py-1.5 pr-8 hover:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="all">☀️ All 9 Solar Farms</option>
                  {farms.map((f) => (
                    <option key={f.id} value={f.id.toString()}>
                      {f.name} ({f.panels} panels)
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Global Summary Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <span className="text-slate-500 block text-[11px] mb-1">Total Solar Generation</span>
            <span className="text-lg font-bold text-amber-600">{totalSolarOutputKw.toFixed(1)} kW</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">9 Arrays (60-120 panels each)</span>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <span className="text-slate-500 block text-[11px] mb-1">Fleet Infeed (GS-01 + GS-02)</span>
            <span className="text-lg font-bold text-blue-600">{totalFleetPowerDrawnKw.toFixed(1)} kW</span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Dedicated to Truck Chargers</span>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <span className="text-slate-500 block text-[11px] mb-1">Battery Rack Infeed (GS-03)</span>
            <span className="text-lg font-bold text-purple-600">
              {stations.find((s) => s.id === 3)?.active ? `${totalBatteryRackDrawnKw.toFixed(1)} kW` : '0.0 kW (Offline)'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">15 Swap Modular Packs</span>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
            <span className="text-slate-500 block text-[11px] mb-1">GS-03 Status</span>
            <span className="text-lg font-bold text-slate-800">
              {stations.find((s) => s.id === 3)?.active ? (
                <span className="text-emerald-600">Active</span>
              ) : (
                <span className="text-slate-400">Standby</span>
              )}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Toggleable on demand</span>
          </div>
        </div>
      </div>

      {/* Grid Stations Display (3 Grid Stations) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Grid Stations (2 Active + 1 Standby/Activatable)
          </h3>
          <span className="text-xs text-slate-400">Click any card to inspect full SCADA diagnostics</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredStations.map((station) => {
            const isGS3 = station.id === 3;
            const connectedFarmsList = farms.filter((f) => station.connectedFarmIds.includes(f.id));
            const totalPanels = connectedFarmsList.reduce((acc, f) => acc + f.panels, 0);

            return (
              <div
                key={station.id}
                id={`grid-station-card-${station.id}`}
                onClick={() =>
                  onSelectDetail({
                    type: 'grid-station',
                    id: station.id,
                    title: station.name,
                    subtitle: `${station.code} · ${station.purpose}`,
                    data: {
                      'Station Code': station.code,
                      'Operational Purpose': station.purpose,
                      'Status': station.active ? 'Active & Supplying' : 'Standby / Deactivated',
                      'Connected Solar Farms': connectedFarmsList.map((f) => f.name).join(', '),
                      'Total Connected Panels': `${totalPanels} solar panels`,
                      'Current Solar Infeed': `${station.currentSolarInputKw.toFixed(1)} kW`,
                      'Station Load': `${station.activeLoadKw.toFixed(1)} kW`,
                      'BESS Buffer Capacity': `${station.bessCapacityKwh} kWh (${station.bessStoredKwh.toFixed(0)} kWh stored - ${station.bessSocPct}%)`,
                      'Grid Voltage': `${station.voltageV.toFixed(1)} V AC (3-Phase)`,
                      'Grid Frequency': `${station.frequencyHz.toFixed(2)} Hz`,
                      'Transformer Temperature': `${station.transformerTempC.toFixed(1)} °C`
                    }
                  })
                }
                className={`bg-white rounded-2xl border transition-all cursor-pointer p-5 hover:shadow-md relative overflow-hidden ${
                  station.active
                    ? isGS3
                      ? 'border-purple-200 ring-1 ring-purple-100'
                      : 'border-blue-200 ring-1 ring-blue-100'
                    : 'border-slate-200 bg-slate-50/70 opacity-80'
                }`}
              >
                {/* Status Pill & Purpose */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md border border-slate-200">
                        {station.code}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900">{station.name}</h4>
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block font-medium">
                      Role: {station.purpose}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      station.active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {station.active ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {station.active ? 'Online' : 'Standby'}
                  </span>
                </div>

                {/* Telemetry Metrics */}
                <div className="grid grid-cols-2 gap-2 my-3 text-xs">
                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                    <span className="text-slate-400 text-[10px] block">Solar Input</span>
                    <span className="text-sm font-bold text-amber-600">
                      {station.currentSolarInputKw.toFixed(1)} kW
                    </span>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                    <span className="text-slate-400 text-[10px] block">Active Draw</span>
                    <span className="text-sm font-bold text-slate-800">
                      {station.active ? `${station.activeLoadKw.toFixed(1)} kW` : '0.0 kW'}
                    </span>
                  </div>
                </div>

                {/* Connected Farms & Panel Info */}
                <div className="text-xs text-slate-600 mb-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Connected Arrays:</span>
                    <span className="font-semibold text-slate-800">3 Solar Farms</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Panels:</span>
                    <span className="font-semibold text-blue-700">{totalPanels} Panels (60–120/ea)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">BESS Buffer:</span>
                    <span className="font-mono text-slate-700">
                      {station.bessStoredKwh.toFixed(0)} / {station.bessCapacityKwh} kWh ({station.bessSocPct}%)
                    </span>
                  </div>
                </div>

                {/* Action button for GS-03 activation */}
                {isGS3 && (
                  <div className="pt-3 border-t border-slate-100 mt-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      id="toggle-grid-station-3-btn"
                      onClick={onToggleGrid3}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs ${
                        station.active
                          ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-purple-600 hover:bg-purple-700 text-white border border-purple-600'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      <span>{station.active ? 'Deactivate GS-03 (Put in Standby)' : 'Activate GS-03 (Start Battery Charging)'}</span>
                    </button>
                    <p className="text-[10px] text-slate-400 text-center mt-1">
                      {station.active
                        ? 'GS-03 is powering the 15-pack battery swap rack.'
                        : 'Standby: Click above to activate GS-03 for dedicated battery charging.'}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 9 Solar Farms (3 Connected per Station, 60 to 120 Panels each) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Solar Farms (3 per Grid Station · 60 to 120 Panels Expandable)
            </h3>
            <p className="text-xs text-slate-400">
              Adjust panel count from 60 up to 120 panels per farm to simulate capacity expansion.
            </p>
          </div>
          <span className="text-xs text-slate-400">Showing {filteredFarms.length} of 9 Farms</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredFarms.map((farm) => {
            const station = stations.find((s) => s.id === farm.stationId);
            const isStationOffline = station && !station.active;

            return (
              <div
                key={farm.id}
                id={`solar-farm-card-${farm.id}`}
                onClick={() =>
                  onSelectDetail({
                    type: 'solar-farm',
                    id: farm.id,
                    title: farm.name,
                    subtitle: `Connected to GS-0${farm.stationId} · ${farm.trackerType}`,
                    data: {
                      'Farm ID': `SF-0${farm.id}`,
                      'Grid Station': `GS-0${farm.stationId} (${station?.purpose || ''})`,
                      'Panel Count': `${farm.panels} Panels (Configurable 60 - 120)`,
                      'Module Specification': `${farm.panelWattageW}W Monocrystalline PERC`,
                      'Array Peak DC Rating': `${((farm.panels * farm.panelWattageW) / 1000).toFixed(1)} kWp`,
                      'Tracker Mechanism': farm.trackerType,
                      'Current AC Output': `${farm.currentOutputKw.toFixed(1)} kW`,
                      'Inverter Efficiency': `${farm.efficiencyPct}%`,
                      'Inverter State': isStationOffline ? 'Standby (Station Deactivated)' : farm.inverterStatus,
                      'Soiling Loss': `${farm.soilingLossPct}%`,
                      'Cell Operating Temp': `${farm.temperatureC.toFixed(1)} °C`
                    }
                  })
                }
                className={`bg-white rounded-2xl border p-4 hover:shadow-md transition-all cursor-pointer ${
                  isStationOffline
                    ? 'border-slate-200 opacity-60 bg-slate-50'
                    : 'border-slate-200 hover:border-amber-300'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      GS-0{farm.stationId} Array
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 leading-snug">{farm.name}</h4>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold rounded-full">
                    {farm.panels} Panels
                  </span>
                </div>

                <div className="text-xs text-slate-500 mb-3 flex items-center justify-between">
                  <span>{farm.trackerType}</span>
                  <span className="font-bold text-amber-600">{farm.currentOutputKw.toFixed(1)} kW</span>
                </div>

                {/* Panel Capacity Controls: Slider & Quick Dropdown (60 to 120 panels) */}
                <div
                  className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-medium">Panels (60–120):</span>
                    <div className="flex items-center gap-1.5">
                      <select
                        id={`farm-${farm.id}-panel-select`}
                        value={farm.panels}
                        onChange={(e) => onUpdateFarmPanels(farm.id, Number(e.target.value))}
                        className="bg-white border border-slate-200 rounded text-xs font-bold text-slate-800 px-1.5 py-0.5 cursor-pointer shadow-2xs"
                      >
                        <option value={60}>60 Panels (Min)</option>
                        <option value={75}>75 Panels</option>
                        <option value={90}>90 Panels</option>
                        <option value={105}>105 Panels</option>
                        <option value={120}>120 Panels (Max)</option>
                      </select>
                    </div>
                  </div>

                  {/* Panel Slider */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-mono">60</span>
                    <input
                      id={`farm-${farm.id}-panel-slider`}
                      type="range"
                      min={60}
                      max={120}
                      step={5}
                      value={farm.panels}
                      onChange={(e) => onUpdateFarmPanels(farm.id, Number(e.target.value))}
                      className="w-full accent-amber-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-400 font-mono">120</span>
                  </div>
                </div>

                <div className="mt-3 flex justify-between text-[11px] text-slate-400">
                  <span>Rating: {((farm.panels * farm.panelWattageW) / 1000).toFixed(1)} kWp</span>
                  <span>Eff: {farm.efficiencyPct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
