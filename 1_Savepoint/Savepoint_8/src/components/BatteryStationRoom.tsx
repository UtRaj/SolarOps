import React, { useState } from 'react';
import {
  Battery,
  Zap,
  Moon,
  Sun,
  ShieldAlert,
  ShieldCheck,
  Power,
  RotateCw,
  Clock,
  Layers,
  ChevronDown,
  Info,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { BatteryPack, SuperBattery, GridStation, Truck, DetailModalContent } from '../types';

interface BatteryStationRoomProps {
  packs: BatteryPack[];
  superBattery: SuperBattery;
  gridStation3: GridStation;
  onToggleGrid3: () => void;
  onTogglePackCharging: (packId: number) => void;
  onFastChargePack: (packId: number) => void;
  onActivateAllPacksCharging: () => void;
  onPerformSwap: (truckId: number) => void;
  trucks: Truck[];
  isNight: boolean;
  onSelectDetail: (content: DetailModalContent) => void;
}

export const BatteryStationRoom: React.FC<BatteryStationRoomProps> = ({
  packs,
  superBattery,
  gridStation3,
  onToggleGrid3,
  onTogglePackCharging,
  onFastChargePack,
  onActivateAllPacksCharging,
  onPerformSwap,
  trucks,
  isNight,
  onSelectDetail
}) => {
  const [packFilter, setPackFilter] = useState<'all' | 'ready' | 'charging' | 'needs-charge'>('all');
  const [selectedTruckForSwap, setSelectedTruckForSwap] = useState<number>(() => {
    const lowTruck = trucks.find((t) => t.soc < 70 && !t.opStatus.startsWith('En Route'));
    return lowTruck ? lowTruck.id : 1;
  });

  const readyPacks = packs.filter((p) => p.soc >= 99);
  const chargingPacks = packs.filter((p) => p.charging && p.soc < 100);
  const otherBatteriesCharging = chargingPacks.length > 0;

  const filteredPacks = packs.filter((p) => {
    if (packFilter === 'ready') return p.soc >= 99;
    if (packFilter === 'charging') return p.charging && p.soc < 100;
    if (packFilter === 'needs-charge') return p.soc < 99 && !p.charging;
    return true;
  });

  const selectedTruck = trucks.find((t) => t.id === selectedTruckForSwap);

  return (
    <div className="space-y-6">
      {/* Top Banner & Dedicated Separation Rule */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md border border-purple-200">
                GS-03 Dedicated
              </span>
              <h2 className="text-base font-bold text-slate-900">
                Battery Swap Station &amp; Super BESS Reserve
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              <strong>Grid Station 03</strong> is isolated from trucks and powers this 15-pack swap facility · <strong>Super Battery</strong> buffers night swaps (17:00–07:00).
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Ready Packs: {readyPacks.length}/15 (100% Full)</span>
            </div>

            <div
              className={`px-3 py-1.5 rounded-xl font-bold border flex items-center gap-1.5 ${
                gridStation3.active
                  ? 'bg-purple-50 border-purple-200 text-purple-800'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>GS-03: {gridStation3.active ? 'Online (Supplying Packs)' : 'Standby'}</span>
            </div>
          </div>
        </div>

        {/* Rule 5 Breakdown: Super Battery & Night Logic */}
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800 block">Super Battery Charging Rule:</span>
              <span className="text-slate-500">
                The Super Battery <strong>charges ONLY when NO other battery is charging</strong> in the rack. Once all 15 packs are idle or full, surplus solar recharges the Super Battery.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Moon className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-800 block">Night Swap Protocol (17:00 – 07:00):</span>
              <span className="text-slate-500">
                At night, battery swaps draw power from the <strong>Super Battery first</strong>, not the grid station. Only when the Super Battery is exhausted (0 kWh) will GS-03 grid power be used.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Super Battery High Capacity Card & One-Click Swap Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Super Battery (6,000 kWh High Capacity) - 7 Cols */}
        <div
          id="super-battery-card"
          onClick={() =>
            onSelectDetail({
              type: 'super-battery',
              id: 'super-bess-01',
              title: superBattery.name,
              subtitle: 'Super High-Capacity Energy Storage System',
              data: {
                'Total Nominal Capacity': `${superBattery.capacityKwh.toLocaleString()} kWh (6.0 MWh)`,
                'Current Stored Energy': `${superBattery.storedKwh.toFixed(1)} kWh`,
                'State of Charge (SoC)': `${superBattery.soc.toFixed(1)}%`,
                'Max Infeed Charging Rate': `${superBattery.maxChargeRateKw} kW`,
                'Max Discharge Rate': `${superBattery.maxDischargeRateKw} kW`,
                'Charging Permitted': otherBatteriesCharging ? 'Blocked (Pack charging active)' : 'Permitted (All packs idle/full)',
                'Active Night Supply': isNight ? (superBattery.storedKwh > 0 ? 'Active (Supplying Swaps)' : 'Exhausted (Fallback to Grid)') : 'Inactive (Day Mode)',
                'Charging Lock Reason': superBattery.lockReason || 'None — Normal Operation'
              }
            })
          }
          className="lg:col-span-7 bg-white border border-slate-200 hover:border-purple-300 rounded-2xl p-5 shadow-xs transition-all cursor-pointer space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200">
                <Battery className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{superBattery.name}</h3>
                <p className="text-[11px] text-slate-500">Super High-Capacity Depot Central Reserve</p>
              </div>
            </div>

            <span className="px-2.5 py-1 bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold rounded-lg font-mono">
              {superBattery.capacityKwh.toLocaleString()} kWh Nominal
            </span>
          </div>

          {/* Stored Energy & Bar */}
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-medium text-slate-600">Stored Energy:</span>
              <div className="text-right">
                <span className="text-xl font-extrabold text-slate-900 font-mono">
                  {superBattery.storedKwh.toFixed(0)}
                </span>
                <span className="text-xs text-slate-500 font-mono ml-1">
                  / {superBattery.capacityKwh.toLocaleString()} kWh
                </span>
                <span className="text-sm font-bold text-purple-600 font-mono ml-2">
                  ({superBattery.soc.toFixed(1)}%)
                </span>
              </div>
            </div>

            <div className="w-full bg-slate-100 h-3.5 rounded-full overflow-hidden p-0.5 border border-slate-200">
              <div
                className="bg-gradient-to-r from-purple-500 to-indigo-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${superBattery.soc}%` }}
              />
            </div>
          </div>

          {/* Rule 5 Condition Status Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
            {/* Condition 1: Charging lock state */}
            <div className={`p-3 rounded-xl border ${
              otherBatteriesCharging
                ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            }`}>
              <div className="font-bold flex items-center gap-1.5 mb-1">
                {otherBatteriesCharging ? (
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                )}
                <span>Super Battery Charging Lock:</span>
              </div>
              <p className="text-[11px] text-slate-600">
                {otherBatteriesCharging
                  ? `LOCKED: ${chargingPacks.length} swap pack(s) currently charging. Super Battery waits.`
                  : 'READY TO CHARGE: Zero swap packs charging. Charges via surplus solar.'}
              </p>
            </div>

            {/* Condition 2: Night Supply Status */}
            <div className={`p-3 rounded-xl border ${
              isNight
                ? superBattery.storedKwh > 0
                  ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
                  : 'bg-rose-50/70 border-rose-200 text-rose-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <div className="font-bold flex items-center gap-1.5 mb-1">
                {isNight ? <Moon className="w-3.5 h-3.5 text-indigo-600" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                <span>Night Power Routing (17:00–07:00):</span>
              </div>
              <p className="text-[11px] text-slate-600">
                {isNight ? (
                  superBattery.storedKwh > 0 ? (
                    <span className="text-indigo-700 font-semibold">
                      Swaps drawing directly from Super Battery (0 kW from Grid).
                    </span>
                  ) : (
                    <span className="text-rose-700 font-semibold">
                      Super Battery exhausted (0 kWh). Swaps falling back to GS-03 grid!
                    </span>
                  )
                ) : (
                  'Day Mode active: Daytime solar and GS-03 direct power active.'
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Instant Battery Swap Action Simulator (5 Cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <RotateCw className="w-4 h-4 text-purple-600" />
                <span>Instant Truck Battery Swap</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Instantly swap any low truck's battery with a 100% ready pack
              </p>
            </div>
          </div>

          {/* Select Truck Dropdown */}
          <div className="text-xs space-y-1">
            <label className="font-semibold text-slate-700 block">
              Select Truck to Receive 100% Battery Pack:
            </label>
            <div className="relative">
              <select
                id="battery-swap-truck-select"
                value={selectedTruckForSwap}
                onChange={(e) => setSelectedTruckForSwap(Number(e.target.value))}
                className="w-full appearance-none bg-slate-50 border border-slate-300 text-slate-800 font-bold rounded-xl px-3 py-2.5 pr-8 hover:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer shadow-2xs"
              >
                {trucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.soc.toFixed(0)}% Battery · [{t.opStatus}]
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Current Source Info at Current Time */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Ready Swap Packs Available:</span>
              <strong className="text-emerald-700">{readyPacks.length} packs at 100%</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Current Time Policy:</span>
              <strong className={isNight ? 'text-indigo-700' : 'text-amber-700'}>
                {isNight ? 'Night Window (17:00–07:00)' : 'Day Window'}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Primary Power Source:</span>
              <strong className="text-purple-700 font-mono">
                {isNight
                  ? superBattery.storedKwh > 0
                    ? 'Super Battery (6,000 kWh Unit)'
                    : 'GS-03 Grid (Fallback)'
                  : 'GS-03 Solar & Grid Buffer'}
              </strong>
            </div>
          </div>

          {/* Swap Trigger Button */}
          <button
            id="perform-battery-swap-btn"
            onClick={() => onPerformSwap(selectedTruckForSwap)}
            disabled={readyPacks.length === 0 || !selectedTruck || selectedTruck.opStatus.startsWith('En Route')}
            className={`w-full py-3 px-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm transition-all text-xs ${
              readyPacks.length === 0 || !selectedTruck || selectedTruck.opStatus.startsWith('En Route')
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer active:scale-[0.99]'
            }`}
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>
              Execute Swap for {selectedTruck?.name || 'Truck'} (100% Pack)
            </span>
          </button>

          {readyPacks.length === 0 && (
            <p className="text-[11px] text-amber-600 text-center font-medium">
              No packs are at 100% yet. Please wait for GS-03 or Super Battery to finish charging a pack.
            </p>
          )}
        </div>
      </div>

      {/* 15 Modular Battery Packs Rack */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-600" />
              <span>15 Modular Battery Swap Packs (Pack-01 to Pack-15)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Each pack: 35 kWh LFP cell chemistry · Dedicated charging from Grid Station 03
            </p>
          </div>

          {/* Filter Dropdown & Batch Action */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="activate-all-packs-charging-btn"
              onClick={onActivateAllPacksCharging}
              className="px-2.5 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-800 text-xs font-bold rounded-lg border border-purple-300 transition-colors cursor-pointer"
              title="Activate GS-03 and charge all packs under 100%"
            >
              ⚡ Charge All Low Packs
            </button>
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">Filter:</span>
            <div className="relative">
              <select
                id="battery-pack-filter-select"
                value={packFilter}
                onChange={(e) => setPackFilter(e.target.value as any)}
                className="appearance-none bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-lg px-3 py-1.5 pr-8 hover:bg-white focus:outline-none cursor-pointer"
              >
                <option value="all">🔋 All 15 Packs</option>
                <option value="ready">🟢 Ready (100% Full)</option>
                <option value="charging">⚡ Charging</option>
                <option value="needs-charge">⏳ Needs Charge / Idle</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* 15 Packs Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {filteredPacks.map((pack) => {
            const isFull = pack.soc >= 99.5;

            return (
              <div
                key={pack.id}
                id={`battery-pack-card-${pack.id}`}
                onClick={() =>
                  onSelectDetail({
                    type: 'battery-pack',
                    id: pack.id,
                    title: pack.name,
                    subtitle: `${pack.capacityKwh} kWh Modular Swap Unit`,
                    data: {
                      'Pack ID': pack.name,
                      'State of Charge': `${pack.soc.toFixed(1)}% (${((pack.soc / 100) * pack.capacityKwh).toFixed(1)} kWh)`,
                      'Status': pack.status,
                      'Charging Active': pack.charging ? `Yes (+${pack.chargeRateKw} kW)` : 'No / Stored',
                      'Power Infeed Source': isNight
                        ? (superBattery.storedKwh > 0 ? 'Super Battery Reserve' : 'GS-03 Grid Fallback')
                        : 'Grid Station 03 Solar & BESS',
                      'Cell Health': `${pack.healthPct}% SOH`,
                      'Full Charge Cycles': `${pack.cycles} Cycles`
                    }
                  })
                }
                className={`bg-white border rounded-xl p-3 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between ${
                  isFull
                    ? 'border-emerald-200 bg-emerald-50/20 ring-1 ring-emerald-100'
                    : pack.charging
                    ? 'border-purple-200 bg-purple-50/20 ring-1 ring-purple-100'
                    : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-slate-800">{pack.name}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${
                        isFull
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : pack.charging
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isFull ? '100% Ready' : pack.charging ? 'Charging' : 'Idle'}
                    </span>
                  </div>

                  <div className="space-y-1 my-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-medium">SoC:</span>
                      <span className="font-mono font-bold text-slate-800">{pack.soc.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isFull
                            ? 'bg-emerald-500'
                            : pack.charging
                            ? 'bg-purple-500'
                            : 'bg-amber-400'
                        }`}
                        style={{ width: `${pack.soc}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 flex justify-between">
                    <span>{pack.capacityKwh} kWh</span>
                    {pack.charging && (
                      <span className="text-purple-600 font-semibold font-mono">
                        +{pack.chargeRateKw} kW
                      </span>
                    )}
                  </div>
                </div>

                {/* Individual Pack Toggle & Fast-Fill Buttons */}
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onTogglePackCharging(pack.id)}
                    disabled={isFull}
                    className={`py-1 rounded text-[10px] font-bold transition-colors ${
                      isFull
                        ? 'w-full bg-slate-100 text-slate-400 cursor-not-allowed'
                        : pack.charging
                        ? 'w-2/3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                        : 'w-2/3 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                    }`}
                  >
                    {isFull ? 'Full (Ready)' : pack.charging ? 'Pause' : 'Start'}
                  </button>
                  {!isFull && (
                    <button
                      id={`fast-charge-pack-${pack.id}-btn`}
                      onClick={() => onFastChargePack(pack.id)}
                      className="w-1/3 py-1 rounded text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors"
                      title="Instantly charge pack to 100% full"
                    >
                      ⚡ 100%
                    </button>
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
