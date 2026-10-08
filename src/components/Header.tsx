import React from 'react';
import {
  Sun,
  Moon,
  Zap,
  Clock,
  Play,
  Pause,
  CloudSun,
  BatteryCharging,
  Sliders,
  ChevronDown,
  Compass
} from 'lucide-react';
import { ViewTab, WeatherType } from '../types';
import { formatTime } from '../utils/solarPhysics';

interface HeaderProps {
  currentTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  simHours: number;
  onSimHoursChange: (hours: number) => void;
  speedMultiplier: number;
  onSpeedChange: (speed: number) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  weatherType: WeatherType;
  onWeatherChange: (type: WeatherType) => void;
  isNight: boolean;
  activeTruckChargersCount: number;
  grid3Active: boolean;
  ordersCount?: number;
  activeChatCount?: number;
}

const SPEED_OPTIONS = [
  { label: '1x (Real-time)', value: 1 },
  { label: '5x (Rapid preview)', value: 5 },
  { label: '15x (15 min/sec)', value: 15 },
  { label: '60x (1 hour/sec)', value: 60 }
];

const TIME_PRESETS = [
  { label: '06:00 — Sunrise', hours: 6.0 },
  { label: '09:30 — Morning Ramp', hours: 9.5 },
  { label: '12:00 — Midday Solar Peak', hours: 12.0 },
  { label: '15:30 — Afternoon Transit', hours: 15.5 },
  { label: '17:30 — Night Shift (Super BESS)', hours: 17.5 },
  { label: '21:00 — Night Operations', hours: 21.0 },
  { label: '00:00 — Midnight', hours: 0.0 }
];

const WEATHER_OPTIONS: WeatherType[] = [
  'Clear / Sunny',
  'Scattered Clouds',
  'Overcast',
  'Thunderstorm',
  'Extreme Heat'
];

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onTabChange,
  simHours,
  onSimHoursChange,
  speedMultiplier,
  onSpeedChange,
  isPaused,
  onTogglePause,
  weatherType,
  onWeatherChange,
  isNight,
  activeTruckChargersCount,
  grid3Active,
  ordersCount = 0,
  activeChatCount = 0
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-sky-500 flex items-center justify-center text-white shadow-sm ring-2 ring-amber-100">
            <Zap className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900 leading-tight">
                SolarOps · Clean Energy &amp; EV Fleet Platform
              </h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                Live SCADA &amp; Fleet
              </span>
            </div>
            <p className="text-xs text-slate-500">
              2 Active Grid Stations (+1 Standby) · 60-120 Panels · 10 Trucks (Max 5 Charging) · 15 DPs · Super BESS
            </p>
          </div>
        </div>

        {/* Global Key Status Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Night / Day Policy Badge */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
              isNight
                ? 'bg-indigo-50 border-indigo-200 text-indigo-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
            title={
              isNight
                ? 'Night Window (17:00 - 07:00): Swaps draw from Super Battery first before GS-03 grid'
                : 'Day Window (07:00 - 17:00): Active solar generation powering fleet and grid buffers'
            }
          >
            {isNight ? <Moon className="w-3.5 h-3.5 text-indigo-600" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
            <span>{isNight ? 'Night Mode (17:00–07:00)' : 'Day Mode (Solar Active)'}</span>
          </div>

          {/* 5 Chargers Limit Badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-800">
            <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" />
            <span>Chargers: {activeTruckChargersCount}/5 Active</span>
          </div>

          {/* GS-03 Status Badge */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
              grid3Active
                ? 'bg-purple-50 border-purple-200 text-purple-800'
                : 'bg-slate-100 border-slate-200 text-slate-600'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>GS-03: {grid3Active ? 'Online (Batteries)' : 'Standby'}</span>
          </div>
        </div>
      </div>

      {/* Control Strip: 1 Tile + 2 Dropdowns & Simulation Controls */}
      <div className="bg-slate-50/70 border-t border-slate-200/80 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Navigation Controls: Tile 1 + Dropdown 2 + Dropdown 3 */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 1. Tile with Executive Overview & Topology */}
            <button
              id="nav-tile-overview"
              onClick={() => onTabChange('overview')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold border transition-all shadow-2xs cursor-pointer ${
                currentTab === 'overview'
                  ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-100'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Executive Overview &amp; Topology</span>
            </button>

            {/* 2. Dropdown with Battery Packs & Solar Grid Stations */}
            <div className="relative inline-block">
              <select
                id="nav-dropdown-energy"
                value={currentTab === 'battery' || currentTab === 'solar-grid' ? currentTab : ''}
                onChange={(e) => {
                  if (e.target.value) onTabChange(e.target.value as ViewTab);
                }}
                className={`appearance-none font-semibold rounded-xl px-3 py-1.5 pr-8 border transition-all shadow-2xs cursor-pointer text-xs ${
                  currentTab === 'battery' || currentTab === 'solar-grid'
                    ? 'bg-purple-50 border-purple-300 text-purple-900 ring-2 ring-purple-100'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <option value="" disabled>
                  ⚡ Battery Packs &amp; Solar Stations ▾
                </option>
                <option value="battery">🔋 Battery Packs &amp; Super BESS</option>
                <option value="solar-grid">☀️ Solar Grid Stations &amp; Arrays</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* 3. Dropdown with Truck Fleet & Dispatch Map */}
            <div className="relative inline-block">
              <select
                id="nav-dropdown-fleet"
                value={currentTab === 'fleet' || currentTab === 'map' ? currentTab : ''}
                onChange={(e) => {
                  if (e.target.value) onTabChange(e.target.value as ViewTab);
                }}
                className={`appearance-none font-semibold rounded-xl px-3 py-1.5 pr-8 border transition-all shadow-2xs cursor-pointer text-xs ${
                  currentTab === 'fleet' || currentTab === 'map'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 ring-2 ring-emerald-100'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <option value="" disabled>
                  🚚 Truck Fleet &amp; Dispatch Map ▾
                </option>
                <option value="fleet">🚚 10-Truck Fleet &amp; Charging Bays</option>
                <option value="map">🗺️ Interactive Dispatch Map</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* 4. Dropdown with Commercial Orders & Merchant AI Chat */}
            <div className="relative inline-block">
              <select
                id="nav-dropdown-orders"
                value={currentTab === 'orders' || currentTab === 'chat' ? currentTab : ''}
                onChange={(e) => {
                  if (e.target.value) onTabChange(e.target.value as ViewTab);
                }}
                className={`appearance-none font-semibold rounded-xl px-3 py-1.5 pr-8 border transition-all shadow-2xs cursor-pointer text-xs ${
                  currentTab === 'orders' || currentTab === 'chat'
                    ? 'bg-blue-50 border-blue-400 text-blue-900 ring-2 ring-blue-100 font-bold'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <option value="" disabled>
                  📦 Commercial Orders &amp; AI Chat ▾
                </option>
                <option value="orders">📋 Orders Pipeline ({ordersCount})</option>
                <option value="chat">💬 Merchant AI Chat ({activeChatCount}/5 Active)</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Simulation Controls: Speed, Time Jump, Weather, Play/Pause */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Play/Pause Button */}
            <button
              id="sim-pause-toggle-btn"
              onClick={onTogglePause}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold border transition-colors ${
                isPaused
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-2xs'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>

            {/* Speed Dropdown */}
            <div className="relative inline-block">
              <select
                id="sim-speed-select"
                value={speedMultiplier}
                onChange={(e) => onSpeedChange(Number(e.target.value))}
                className="appearance-none bg-white border border-slate-300 text-slate-700 font-medium rounded-lg px-2.5 py-1.5 pr-7 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
              >
                {SPEED_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    Speed: {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Time Jump Preset Dropdown */}
            <div className="relative inline-block">
              <select
                id="sim-time-jump-select"
                value=""
                onChange={(e) => {
                  if (e.target.value !== '') {
                    onSimHoursChange(Number(e.target.value));
                  }
                }}
                className="appearance-none bg-white border border-slate-300 text-slate-700 font-medium rounded-lg px-2.5 py-1.5 pr-7 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
              >
                <option value="" disabled>
                  ⏱️ Jump to Time...
                </option>
                {TIME_PRESETS.map((preset) => (
                  <option key={preset.label} value={preset.hours}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Weather Dropdown */}
            <div className="relative inline-block">
              <select
                id="sim-weather-select"
                value={weatherType}
                onChange={(e) => onWeatherChange(e.target.value as WeatherType)}
                className="appearance-none bg-white border border-slate-300 text-slate-700 font-medium rounded-lg px-2.5 py-1.5 pr-7 hover:border-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs cursor-pointer"
              >
                {WEATHER_OPTIONS.map((w) => (
                  <option key={w} value={w}>
                    🌤️ {w}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Clock & Scrub Slider */}
            <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-slate-300 shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-mono font-bold text-slate-800 text-xs w-11">{formatTime(simHours)}</span>
              <input
                id="sim-hour-slider"
                type="range"
                min="0"
                max="23.99"
                step="0.25"
                value={simHours % 24}
                onChange={(e) => onSimHoursChange(Number(e.target.value))}
                className="w-20 sm:w-28 accent-blue-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
                title="Scrub 24h simulation time"
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
