import React, { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, AreaChart, Area } from "recharts";
import { Sun, CloudSun, Droplets, Thermometer, Plus, Minus, Zap, Sparkles, Clock, Battery, Gauge, Truck, RotateCcw, Activity } from "lucide-react";

const PANEL_KW = 0.4;
const BASE_PANELS_F1 = 40;
const BASE_PANELS_F2 = 30;
const MAX_PANELS = 120;
const MIN_PANELS = 10;

const TRANSMISSION_LOSS_F1 = 4.5;
const TRANSMISSION_LOSS_F2 = 3.8;

const STATION_BASE_CAPACITY_KWH = 60;
const STATION_BASE_CHARGE_RATE_KW = 8;
const MODULE_CAPACITY_KWH = 30;
const MODULE_CHARGE_RATE_KW = 4;
const MAX_MODULES = 4;
const STATION_LOAD_KW = 1.2;
const CHARGE_EFFICIENCY = 0.92;
const INVERTER_EFFICIENCY = 0.978;

const REAL_TICK_MS = 1000;
const SPEEDS = [
  { label: "Real-time", minPerTick: 1 / 60 },
  { label: "1 min / s", minPerTick: 1 },
  { label: "5 min / s", minPerTick: 5 },
  { label: "15 min / s", minPerTick: 15 },
  { label: "1 hr / s", minPerTick: 60 },
];

const TIME_PRESETS = [
  { label: "Dawn (06:00)", hour: 6.0 },
  { label: "Midday Noon (12:00)", hour: 12.0 },
  { label: "Fleet Rush (17:30)", hour: 17.5 },
  { label: "Golden Dusk (18:30)", hour: 18.5 },
  { label: "Nightfall (21:00)", hour: 21.0 },
  { label: "Midnight (00:00)", hour: 0.0 }
];

const WEATHER_PRESETS = [
  { label: "☀️ Clear Sky", temp: 28, hum: 40, cloud: 5 },
  { label: "⛅ Scattered Clouds", temp: 26, hum: 55, cloud: 45 },
  { label: "⛈ Heavy Storm", temp: 20, hum: 92, cloud: 88 },
  { label: "🔥 Extreme Heat", temp: 43, hum: 15, cloud: 0 },
  { label: "🌫 Dense Haze / Soiling", temp: 31, hum: 75, cloud: 60 }
];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function computeFarm01Output(panels, tempC, humidity, cloudCover, hourOfDay, soilingFactor = 1.0) {
  let sunElevation = Math.sin(((hourOfDay - 6) / 12) * Math.PI);
  if (hourOfDay < 6 || hourOfDay > 18) sunElevation = 0;
  sunElevation = Math.max(0, sunElevation);

  const cloudFactor = 1 - (cloudCover / 100) * 0.85;
  const humidityFactor = 1 - (humidity / 100) * 0.15;
  let tempFactor = 1;
  if (tempC > 25) tempFactor = 1 - (tempC - 25) * 0.004;
  else if (tempC < 10) tempFactor = 1 - (10 - tempC) * 0.01;
  tempFactor = clamp(tempFactor, 0.5, 1.05);

  return Math.max(0, panels * PANEL_KW * sunElevation * cloudFactor * humidityFactor * tempFactor * soilingFactor * INVERTER_EFFICIENCY);
}

function computeFarm02Output(panels, tempC, humidity, cloudCover, hourOfDay, soilingFactor = 1.0) {
  let trackerElevation = Math.sin(((hourOfDay - 5.5) / 13) * Math.PI);
  if (hourOfDay < 5.5 || hourOfDay > 18.5) trackerElevation = 0;
  trackerElevation = Math.max(0, Math.pow(trackerElevation, 0.72));

  const cloudFactor = 1 - (cloudCover / 100) * 0.82;
  const humidityFactor = 1 - (humidity / 100) * 0.12;
  let tempFactor = 1;
  if (tempC > 25) tempFactor = 1 - (tempC - 25) * 0.0035;
  tempFactor = clamp(tempFactor, 0.55, 1.05);

  return Math.max(0, panels * PANEL_KW * trackerElevation * cloudFactor * humidityFactor * tempFactor * soilingFactor * 1.08 * INVERTER_EFFICIENCY);
}

function tempAtHour(hour, noise) { return clamp(22 + 9 * Math.sin(((hour - 6) / 24) * 2 * Math.PI) + noise, 4, 46); }
function humidityAtHour(hour, noise) { return clamp(60 - 25 * Math.sin(((hour - 6) / 24) * 2 * Math.PI) + noise, 5, 98); }
function cloudDrift(prev, noise) { return clamp(prev + noise, 0, 100); }
function fmtClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function SolarLogisticsApp() {
  const [consoleView, setConsoleView] = useState("solar");

  const [simMinutes, setSimMinutes] = useState(9 * 60);
  const [speedIdx, setSpeedIdx] = useState(2);
  const [paused, setPaused] = useState(false);

  const [autoWeather, setAutoWeather] = useState(true);
  const [tempC, setTempC] = useState(28);
  const [humidity, setHumidity] = useState(45);
  const [cloudCover, setCloudCover] = useState(15);
  const [soilingLoss, setSoilingLoss] = useState(2);

  const [panelsF1, setPanelsF1] = useState(BASE_PANELS_F1);
  const [panelsF2, setPanelsF2] = useState(BASE_PANELS_F2);
  const [modules, setModules] = useState(1);
  const [storedKwh, setStoredKwh] = useState(STATION_BASE_CAPACITY_KWH * 0.45);
  
  const [dispatchMode, setDispatchMode] = useState("AUTO");

  const [fleetBays, setFleetBays] = useState([
    { id: 1, name: "Hauler Alpha (Truck-01)", connected: true, soc: 42, targetSoc: 90, chargeRateKw: 25, batteryCapKwh: 120, status: "Charging (Fast DC)" },
    { id: 2, name: "Hauler Bravo (Truck-02)", connected: true, soc: 68, targetSoc: 90, chargeRateKw: 20, batteryCapKwh: 120, status: "Charging (Nominal)" },
    { id: 3, name: "Hauler Charlie (Truck-03)", connected: false, soc: 18, targetSoc: 85, chargeRateKw: 0, batteryCapKwh: 120, status: "Bay Available (On Route)" }
  ]);
  const [autoFleetSchedule, setAutoFleetSchedule] = useState(true);
  const [trucksServicedCount, setTrucksServicedCount] = useState(6);

  const [gridFreqHz, setGridFreqHz] = useState(50.00);
  const [bessTempC, setBessTempC] = useState(26.5);
  const [totalGeneratedKwh, setTotalGeneratedKwh] = useState(185.0);
  const [curtailedTotalKwh, setCurtailedTotalKwh] = useState(1.4);
  const [totalFleetDeliveredKwh, setTotalFleetDeliveredKwh] = useState(94.0);

  const [advisories, setAdvisories] = useState([]);
  const [advisoryLoading, setAdvisoryLoading] = useState(false);
  const [flowPulse, setFlowPulse] = useState(0);
  const [operatorQuery, setOperatorQuery] = useState("");
  const [history, setHistory] = useState([]);

  const prevOutputRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastAutoMinuteRef = useRef(-9999);

  const hourOfDay = (simMinutes / 60) % 24;
  const isNight = hourOfDay < 5.5 || hourOfDay >= 19;
  const stationCapacityKwh = STATION_BASE_CAPACITY_KWH + modules * MODULE_CAPACITY_KWH;
  const stationChargeRateKw = STATION_BASE_CHARGE_RATE_KW + modules * MODULE_CHARGE_RATE_KW;

  const f1OutputKw = computeFarm01Output(panelsF1, tempC, humidity, cloudCover, hourOfDay, 1 - (soilingLoss / 100));
  const f1LossKw = f1OutputKw * (TRANSMISSION_LOSS_F1 / 100);
  const f1GridInputKw = f1OutputKw - f1LossKw;

  const f2OutputKw = computeFarm02Output(panelsF2, tempC, humidity, cloudCover, hourOfDay, 1 - (soilingLoss / 100));
  const f2LossKw = f2OutputKw * (TRANSMISSION_LOSS_F2 / 100);
  const f2GridInputKw = f2OutputKw - f2LossKw;

  const totalGenerationKw = f1OutputKw + f2OutputKw;
  const totalDeliveredToStationKw = f1GridInputKw + f2GridInputKw;
  const totalCapKw = (panelsF1 + panelsF2) * PANEL_KW;
  const stationPct = (storedKwh / stationCapacityKwh) * 100;

  const totalFleetDemandKw = fleetBays.reduce((sum, b) => sum + (b.connected && b.soc < b.targetSoc ? b.chargeRateKw : 0), 0);
  const totalStationLoadKw = STATION_LOAD_KW + totalFleetDemandKw;
  const netPowerKw = totalDeliveredToStationKw - totalStationLoadKw;

  let chargeKw = 0;
  let dischargeKw = 0;
  let curtailedKw = 0;

  if (dispatchMode === "PEAK_SHAVING" && isNight && storedKwh > 10) {
    const peakExport = Math.min(15, stationChargeRateKw);
    dischargeKw = Math.min(peakExport + totalStationLoadKw, stationChargeRateKw);
  } else if (netPowerKw >= 0) {
    if (storedKwh >= stationCapacityKwh) {
      curtailedKw = netPowerKw;
      chargeKw = 0;
    } else {
      chargeKw = Math.min(netPowerKw, stationChargeRateKw);
      curtailedKw = netPowerKw - chargeKw;
    }
  } else {
    dischargeKw = Math.min(-netPowerKw, stationChargeRateKw);
  }

  const co2AvoidedKg = (totalGeneratedKwh * 0.42).toFixed(1);
  const revenueUsd = (totalGeneratedKwh * 0.14 + totalFleetDeliveredKwh * 0.22).toFixed(2);

  const askAdvisor = useCallback(async (customTriggerText = null) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setAdvisoryLoading(true);

    const currentTimeStr = fmtClock(hourOfDay);
    const reason = customTriggerText || "routine diagnostic sweep";

    try {
      let adviceText = "";
      if (customTriggerText && customTriggerText.startsWith("USER:")) {
        const query = customTriggerText.replace("USER:", "").trim().toLowerCase();
        if (query.includes("fleet") || query.includes("truck") || query.includes("charging")) {
          adviceText = `Fleet Hub CS-01 drawing ${totalFleetDemandKw.toFixed(1)} kW. ${totalDeliveredToStationKw >= totalFleetDemandKw ? "100% green solar coverage directly powering haulers." : `BESS buffer supplying ${dischargeKw.toFixed(1)} kW deficit.`}`;
        } else if (query.includes("tonight") || query.includes("endurance") || query.includes("battery")) {
          const netDraw = totalFleetDemandKw + STATION_LOAD_KW;
          const enduranceHours = netDraw > 0 ? (storedKwh / netDraw) : 99;
          adviceText = `BESS storage holds ${storedKwh.toFixed(1)} kWh (${stationPct.toFixed(0)}%). At current draw, reserve endurance is approx ${enduranceHours.toFixed(1)} hours.`;
        } else if (query.includes("farm") || query.includes("solar")) {
          adviceText = `Farm 01 (Fixed): ${f1OutputKw.toFixed(1)} kW | Farm 02 (Tracker): ${f2OutputKw.toFixed(1)} kW. Combined delivery: ${totalDeliveredToStationKw.toFixed(1)} kW.`;
        } else {
          adviceText = `Telemetry: 2 Farms delivering ${totalDeliveredToStationKw.toFixed(1)} kW, Fleet drawing ${totalFleetDemandKw.toFixed(1)} kW, BESS SoC ${stationPct.toFixed(0)}%, grid freq ${gridFreqHz.toFixed(2)} Hz.`;
        }
      } else {
        if (totalFleetDemandKw > 35 && totalDeliveredToStationKw < 10) {
          adviceText = `Evening fleet charging active (${totalFleetDemandKw.toFixed(1)} kW draw). BESS discharging at ${dischargeKw.toFixed(1)} kW.`;
        } else if (curtailedKw > 1.0) {
          adviceText = `Combined 2-Farm output (${totalGenerationKw.toFixed(1)} kW) exceeds BESS intake ceiling (${stationChargeRateKw} kW). Connect queued fleet trucks to utilize power.`;
        } else if (stationPct >= 94) {
          adviceText = `Grid station BESS buffer saturated at ${stationPct.toFixed(0)}%. Priority routed to fleet top-ups and municipal export.`;
        } else {
          adviceText = `Operations synchronized at ${currentTimeStr}. Farm 01 (${f1OutputKw.toFixed(1)} kW) + Farm 02 (${f2OutputKw.toFixed(1)} kW) feeding ${totalDeliveredToStationKw.toFixed(1)} kW. Fleet: ${totalFleetDemandKw.toFixed(1)} kW.`;
        }
      }

      await new Promise((r) => setTimeout(r, 200));
      setAdvisories((prev) => [{
        id: Date.now(),
        time: currentTimeStr,
        text: adviceText,
        reason: customTriggerText ? "Operator Query" : reason
      }, ...prev].slice(0, 8));
    } catch (e) {
      setAdvisories((prev) => [{
        id: Date.now(),
        time: currentTimeStr,
        text: "AI Dispatcher telemetry active.",
        reason: "diagnostic"
      }, ...prev].slice(0, 8));
    } finally {
      setAdvisoryLoading(false);
      inFlightRef.current = false;
    }
  }, [hourOfDay, storedKwh, stationPct, stationCapacityKwh, stationChargeRateKw, curtailedKw, totalGenerationKw, totalDeliveredToStationKw, f1OutputKw, f2OutputKw, totalFleetDemandKw, isNight, dispatchMode, dischargeKw, gridFreqHz]);

  useEffect(() => {
    if (paused) return;
    const minPerTick = SPEEDS[speedIdx].minPerTick;
    const interval = setInterval(() => {
      setSimMinutes((m) => m + minPerTick);
      setFlowPulse((p) => (p + 1) % 1000);
      setGridFreqHz(50.0 + (Math.random() - 0.5) * 0.04);
      setBessTempC(25 + (storedKwh / stationCapacityKwh) * 5 + (chargeKw > 4 || dischargeKw > 20 ? 2.8 : 0) + (Math.random() - 0.5) * 0.3);

      if (autoFleetSchedule) {
        setFleetBays((bays) => bays.map((bay) => {
          if (bay.connected && bay.soc < bay.targetSoc) {
            const dtHours = minPerTick / 60;
            const addedKwh = bay.chargeRateKw * dtHours;
            const newSoc = clamp(bay.soc + (addedKwh / bay.batteryCapKwh) * 100, 0, bay.targetSoc);
            return {
              ...bay,
              soc: newSoc,
              status: newSoc >= bay.targetSoc ? "Full (Ready for Route)" : bay.status
            };
          }
          if (hourOfDay >= 17.5 && hourOfDay <= 18.5 && !bay.connected && bay.id === 3) {
            return { ...bay, connected: true, soc: 18, status: "Charging (Evening Depot Rush)" };
          }
          return bay;
        }));
      }
    }, REAL_TICK_MS);
    return () => clearInterval(interval);
  }, [paused, speedIdx, storedKwh, stationCapacityKwh, chargeKw, dischargeKw, autoFleetSchedule, hourOfDay]);

  useEffect(() => {
    if (!autoWeather) return;
    setTempC(tempAtHour(hourOfDay, (Math.random() - 0.5) * 1.2));
    setHumidity(humidityAtHour(hourOfDay, (Math.random() - 0.5) * 2.5));
    setCloudCover((prev) => cloudDrift(prev, (Math.random() - 0.5) * 5));
  }, [simMinutes, autoWeather, hourOfDay]);

  useEffect(() => {
    const minPerTick = SPEEDS[speedIdx].minPerTick;
    const dt = (paused ? 0 : minPerTick) / 60;

    if (totalGenerationKw > 0 && dt > 0) setTotalGeneratedKwh((g) => g + totalGenerationKw * dt);
    if (curtailedKw > 0 && dt > 0) setCurtailedTotalKwh((c) => c + curtailedKw * dt);
    if (totalFleetDemandKw > 0 && dt > 0) setTotalFleetDeliveredKwh((f) => f + totalFleetDemandKw * dt);

    setStoredKwh((prev) => {
      let delta = 0;
      if (chargeKw > 0) delta = chargeKw * dt * CHARGE_EFFICIENCY;
      else if (dischargeKw > 0) delta = -dischargeKw * dt;
      return clamp(prev + delta, 0, stationCapacityKwh);
    });

    setHistory((h) => [...h, {
      t: fmtClock(hourOfDay),
      f1: Number(f1OutputKw.toFixed(2)),
      f2: Number(f2OutputKw.toFixed(2)),
      totalSolar: Number(totalGenerationKw.toFixed(2)),
      fleet: Number(totalFleetDemandKw.toFixed(2)),
      battery: Number(storedKwh.toFixed(1)),
      curtailed: Number(curtailedKw.toFixed(2))
    }].slice(-36));
  }, [simMinutes, f1OutputKw, f2OutputKw, totalGenerationKw, totalFleetDemandKw, chargeKw, dischargeKw, curtailedKw, stationCapacityKwh, paused, speedIdx, hourOfDay]);

  const toggleBayConnection = (bayId) => {
    setFleetBays((bays) => bays.map((b) => b.id === bayId ? { ...b, connected: !b.connected, chargeRateKw: !b.connected ? 25 : 0 } : b));
  };

  const performBatterySwap = (bayId) => {
    if (storedKwh < 20) return;
    setStoredKwh((prev) => Math.max(0, prev - 20));
    setFleetBays((bays) => bays.map((b) => b.id === bayId ? { ...b, connected: true, soc: 95, status: "Swapped (95% Full)" } : b));
    setTrucksServicedCount((c) => c + 1);
  };

  const jumpToHour = (h) => {
    const dayBase = Math.floor(simMinutes / 1440) * 1440;
    setSimMinutes(dayBase + h * 60);
  };

  return (
    <div style={{ maxWidth: "1520px", margin: "0 auto", padding: "18px 24px", color: "#C9D3DC", background: "#080D14", minHeight: "100vh" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", background: "#0A1017", padding: "14px 20px", borderRadius: "10px", border: "1px solid #162230" }}>
        <div>
          <h1 style={{ fontSize: "19px", fontWeight: 700, margin: 0, color: "#EDF1F5" }}>MERIDIAN SOLAR & LOGISTICS PLATFORM</h1>
          <span style={{ fontSize: "11px", color: "#6B7A8C" }}>Farms 01 & 02 (2 Solar Farms) • Substation GS-01 BESS • Fleet Hub CS-01</span>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => setConsoleView("solar")} style={{ padding: "8px 18px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", border: consoleView === "solar" ? "1px solid #F5A623" : "1px solid #243547", background: consoleView === "solar" ? "rgba(245,166,35,0.13)" : "#101926", color: consoleView === "solar" ? "#F5A623" : "#8E9EAF", cursor: "pointer" }}>
            ☀️ Solar & Grid Control Room
          </button>
          <button onClick={() => setConsoleView("fleet")} style={{ padding: "8px 18px", fontSize: "13px", fontWeight: 600, borderRadius: "8px", border: consoleView === "fleet" ? "1px solid #2DD4BF" : "1px solid #243547", background: consoleView === "fleet" ? "rgba(45,212,191,0.13)" : "#101926", color: consoleView === "fleet" ? "#2DD4BF" : "#8E9EAF", cursor: "pointer" }}>
            🚚 Fleet Hub CS-01 {totalFleetDemandKw > 0 && `(${totalFleetDemandKw.toFixed(0)} kW)`}
          </button>
        </div>
      </div>
    </div>
  );
}
