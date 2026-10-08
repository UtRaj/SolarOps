import React, { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, AreaChart, Area } from "recharts";
import { Sun, CloudSun, Droplets, Thermometer, Plus, Minus, Zap, Sparkles, Clock, Battery, Gauge, Wind, ShieldAlert, Activity, DollarSign, Leaf } from "lucide-react";

const PANEL_KW = 0.4;
const BASE_PANELS = 40;
const MAX_PANELS = 120;
const MIN_PANELS = 10;
const TRANSMISSION_LOSS_PCT = 4.5;

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
  { label: "Peak Demand (16:30)", hour: 16.5 },
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

function computeOutputKw(panels, tempC, humidity, cloudCover, hourOfDay, soilingFactor = 1.0) {
  let sunElevation = Math.sin(((hourOfDay - 6) / 12) * Math.PI);
  if (hourOfDay < 6 || hourOfDay > 18) sunElevation = 0;
  sunElevation = Math.max(0, sunElevation);

  const cloudFactor = 1 - (cloudCover / 100) * 0.85;
  const humidityFactor = 1 - (humidity / 100) * 0.15;
  let tempFactor = 1;
  if (tempC > 25) tempFactor = 1 - (tempC - 25) * 0.004;
  else if (tempC < 10) tempFactor = 1 - (10 - tempC) * 0.01;
  tempFactor = clamp(tempFactor, 0.5, 1.05);

  const rawGrossKw = panels * PANEL_KW * sunElevation * cloudFactor * humidityFactor * tempFactor * soilingFactor;
  return Math.max(0, rawGrossKw * INVERTER_EFFICIENCY);
}

function tempAtHour(hour, noise) { return clamp(22 + 9 * Math.sin(((hour - 6) / 24) * 2 * Math.PI) + noise, 4, 46); }
function humidityAtHour(hour, noise) { return clamp(60 - 25 * Math.sin(((hour - 6) / 24) * 2 * Math.PI) + noise, 5, 98); }
function cloudDrift(prev, noise) { return clamp(prev + noise, 0, 100); }
function fmtClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function SolarControlCenter() {
  const [simMinutes, setSimMinutes] = useState(9 * 60);
  const [speedIdx, setSpeedIdx] = useState(2);
  const [paused, setPaused] = useState(false);

  const [autoWeather, setAutoWeather] = useState(true);
  const [tempC, setTempC] = useState(29);
  const [humidity, setHumidity] = useState(45);
  const [cloudCover, setCloudCover] = useState(15);
  const [soilingLoss, setSoilingLoss] = useState(2);

  const [panels, setPanels] = useState(BASE_PANELS);
  const [modules, setModules] = useState(1);
  const [storedKwh, setStoredKwh] = useState(STATION_BASE_CAPACITY_KWH * 0.45);
  
  const [dispatchMode, setDispatchMode] = useState("AUTO");
  const [totalGeneratedKwh, setTotalGeneratedKwh] = useState(142.5);
  const [curtailedTotalKwh, setCurtailedTotalKwh] = useState(1.8);

  const [gridFreqHz, setGridFreqHz] = useState(50.00);
  const [bessTempC, setBessTempC] = useState(26.5);
  
  const [advisories, setAdvisories] = useState([]);
  const [advisoryLoading, setAdvisoryLoading] = useState(false);
  const [flowPulse, setFlowPulse] = useState(0);
  const [operatorQuery, setOperatorQuery] = useState("");
  const [history, setHistory] = useState([]);

  const prevOutputRef = useRef(0);
  const inFlightRef = useRef(false);
  const lastAutoMinuteRef = useRef(-9999);

  const hourOfDay = (simMinutes / 60) % 24;
  const isNight = hourOfDay < 6 || hourOfDay >= 19;
  const stationCapacityKwh = STATION_BASE_CAPACITY_KWH + modules * MODULE_CAPACITY_KWH;
  const stationChargeRateKw = STATION_BASE_CHARGE_RATE_KW + modules * MODULE_CHARGE_RATE_KW;

  const outputKw = computeOutputKw(panels, tempC, humidity, cloudCover, hourOfDay, 1 - (soilingLoss / 100));
  const lossKw = outputKw * (TRANSMISSION_LOSS_PCT / 100);
  const gridInputKw = outputKw - lossKw;
  const capacityKw = panels * PANEL_KW;
  const utilization = capacityKw > 0 ? (outputKw / capacityKw) * 100 : 0;
  const stationPct = (storedKwh / stationCapacityKwh) * 100;

  let chargeKw = 0;
  let dischargeKw = 0;
  let curtailedKw = 0;

  if (dispatchMode === "PEAK_SHAVING" && isNight && storedKwh > 5) {
    const requestedExport = Math.min(12, stationChargeRateKw);
    dischargeKw = Math.min(requestedExport, storedKwh * 0.9);
  } else if (gridInputKw > STATION_LOAD_KW) {
    const availableNet = gridInputKw - STATION_LOAD_KW;
    if (storedKwh >= stationCapacityKwh) {
      curtailedKw = availableNet;
      chargeKw = 0;
    } else {
      chargeKw = Math.min(availableNet, stationChargeRateKw);
      curtailedKw = availableNet - chargeKw;
    }
  } else {
    const deficit = STATION_LOAD_KW - gridInputKw;
    dischargeKw = Math.min(deficit, stationChargeRateKw);
  }

  const co2AvoidedKg = (totalGeneratedKwh * 0.42).toFixed(1);
  const revenueUsd = (totalGeneratedKwh * 0.14).toFixed(2);

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
        if (query.includes("tonight") || query.includes("endurance") || query.includes("battery")) {
          const enduranceHours = storedKwh / (STATION_LOAD_KW + (dispatchMode === "PEAK_SHAVING" ? 6 : 0));
          adviceText = `BESS storage holds ${storedKwh.toFixed(1)} kWh (${stationPct.toFixed(0)}%). At current draw, reserve endurance is approx ${enduranceHours.toFixed(1)} hours until morning solar ramp.`;
        } else if (query.includes("storage") || query.includes("module") || query.includes("curtail")) {
          adviceText = curtailedKw > 0.1 
            ? `Currently curtailing ${curtailedKw.toFixed(1)} kW. Adding +1 BESS module will increase intake capacity to ${stationChargeRateKw + 4} kW and eliminate rate bottlenecks.`
            : `Storage capacity is optimal. No active curtailment detected. Intake ceiling at ${stationChargeRateKw} kW.`;
        } else if (query.includes("weather") || query.includes("cloud") || query.includes("storm")) {
          adviceText = `Atmospheric model: ${tempC.toFixed(1)}°C, ${humidity.toFixed(0)}% RH, ${cloudCover.toFixed(0)}% cloud attenuation. Array producing ${outputKw.toFixed(1)} kW (${utilization.toFixed(0)}% capacity).`;
        } else {
          adviceText = `Telemetry analysis: Farm output ${outputKw.toFixed(1)} kW, BESS SoC ${stationPct.toFixed(0)}%, grid frequency ${gridFreqHz.toFixed(2)} Hz. Systems operating within nominal dispatch parameters.`;
        }
      } else {
        if (curtailedKw > 0.5) {
          adviceText = modules < MAX_MODULES 
            ? `Generation yield (${outputKw.toFixed(1)} kW) is bottlenecked by ${stationChargeRateKw} kW charge ceiling (${curtailedKw.toFixed(1)} kW curtailed). Recommend bringing +1 BESS module online.`
            : `Intake capacity maximized (${stationChargeRateKw} kW). Route ${curtailedKw.toFixed(1)} kW excess to external industrial feeder.`;
        } else if (stationPct >= 94) {
          adviceText = `Grid station BESS buffer saturated at ${stationPct.toFixed(0)}% (${storedKwh.toFixed(1)} kWh). Recommend enabling Peak Shaving export to monetize surplus reserves.`;
        } else if (stationPct <= 14) {
          adviceText = isNight
            ? `BESS reserves critical at ${stationPct.toFixed(0)}%. Housekeeping load (-1.2 kW) active. Conserve battery reserves for pre-dawn communications.`
            : `Low storage reserve (${stationPct.toFixed(0)}%). Solar array is replenishing buffer at ${chargeKw.toFixed(1)} kW.`;
        } else if (tempC > 40) {
          adviceText = `High ambient temperature (${tempC.toFixed(1)}°C) causing thermal PV derating (~${((tempC - 25) * 0.4).toFixed(1)}% drop). Inverter operating at ${(INVERTER_EFFICIENCY * 100).toFixed(1)}%.`;
        } else if (isNight) {
          adviceText = dispatchMode === "PEAK_SHAVING"
            ? `Night Peak Shaving active: Discharging ${dischargeKw.toFixed(1)} kW to regional grid. BESS SoC: ${stationPct.toFixed(0)}%.`
            : `Night cycle active. Zero solar irradiance. BESS supplying station housekeeping draw (-1.2 kW). System stable.`;
        } else {
          adviceText = `Dispatch status optimal at ${currentTimeStr}. Farm generating ${outputKw.toFixed(1)} kW (${utilization.toFixed(0)}% STC). BESS buffer at ${stationPct.toFixed(0)}%.`;
        }
      }

      await new Promise((r) => setTimeout(r, 260));
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
        text: "AI Dispatcher telemetry connection active.",
        reason: "diagnostic"
      }, ...prev].slice(0, 8));
    } finally {
      setAdvisoryLoading(false);
      inFlightRef.current = false;
    }
  }, [hourOfDay, storedKwh, stationPct, stationCapacityKwh, stationChargeRateKw, curtailedKw, modules, outputKw, utilization, tempC, humidity, cloudCover, isNight, dispatchMode, dischargeKw, gridFreqHz]);

  useEffect(() => {
    if (paused) return;
    const minPerTick = SPEEDS[speedIdx].minPerTick;
    const interval = setInterval(() => {
      setSimMinutes((m) => m + minPerTick);
      setFlowPulse((p) => (p + 1) % 1000);
      setGridFreqHz(50.0 + (Math.random() - 0.5) * 0.04);
      setBessTempC(25 + (storedKwh / stationCapacityKwh) * 5 + (chargeKw > 4 ? 2.5 : 0) + (Math.random() - 0.5) * 0.4);
    }, REAL_TICK_MS);
    return () => clearInterval(interval);
  }, [paused, speedIdx, storedKwh, stationCapacityKwh, chargeKw]);

  useEffect(() => {
    if (!autoWeather) return;
    setTempC(tempAtHour(hourOfDay, (Math.random() - 0.5) * 1.2));
    setHumidity(humidityAtHour(hourOfDay, (Math.random() - 0.5) * 2.5));
    setCloudCover((prev) => cloudDrift(prev, (Math.random() - 0.5) * 6));
  }, [simMinutes, autoWeather, hourOfDay]);

  useEffect(() => {
    const minPerTick = SPEEDS[speedIdx].minPerTick;
    const dt = (paused ? 0 : minPerTick) / 60;

    if (outputKw > 0 && dt > 0) setTotalGeneratedKwh((g) => g + outputKw * dt);
    if (curtailedKw > 0 && dt > 0) setCurtailedTotalKwh((c) => c + curtailedKw * dt);

    setStoredKwh((prev) => {
      let delta = 0;
      if (chargeKw > 0) delta = chargeKw * dt * CHARGE_EFFICIENCY;
      else if (dischargeKw > 0) delta = -dischargeKw * dt;
      return clamp(prev + delta, 0, stationCapacityKwh);
    });

    setHistory((h) => [...h, {
      t: fmtClock(hourOfDay),
      output: Number(outputKw.toFixed(2)),
      grid: Number(gridInputKw.toFixed(2)),
      battery: Number(storedKwh.toFixed(1)),
      curtailed: Number(curtailedKw.toFixed(2))
    }].slice(-36));
  }, [simMinutes, outputKw, gridInputKw, chargeKw, dischargeKw, curtailedKw, stationCapacityKwh, paused, speedIdx, hourOfDay]);

  useEffect(() => {
    if (simMinutes === 0) return;
    const sinceLast = simMinutes - lastAutoMinuteRef.current;
    const outputDelta = Math.abs(outputKw - prevOutputRef.current);
    let reason = null;

    if (stationPct >= 94 && sinceLast > 40) reason = "BESS saturation threshold reached (≥94%)";
    else if (stationPct <= 12 && sinceLast > 40) reason = "BESS storage depletion warning (≤12%)";
    else if (curtailedKw > 1.2 && sinceLast > 35) reason = "Rate bottlenecking generation yield";
    else if (outputDelta > capacityKw * 0.4 && sinceLast > 30 && capacityKw > 0) reason = "Sudden irradiance fluctuation detected";
    else if (sinceLast >= 120) reason = "Scheduled telemetry health check";

    if (reason) {
      lastAutoMinuteRef.current = simMinutes;
      askAdvisor(reason);
    }
    prevOutputRef.current = outputKw;
  }, [simMinutes, stationPct, curtailedKw, outputKw, capacityKw, askAdvisor]);

  const installPanels = (n) => setPanels((p) => clamp(p + n, MIN_PANELS, MAX_PANELS));
  const installModules = (n) => {
    const nextMod = clamp(modules + n, 0, MAX_MODULES);
    setModules(nextMod);
    setStoredKwh((prev) => clamp(prev, 0, STATION_BASE_CAPACITY_KWH + nextMod * MODULE_CAPACITY_KWH));
  };

  const jumpToHour = (h) => {
    const dayBase = Math.floor(simMinutes / 1440) * 1440;
    setSimMinutes(dayBase + h * 60);
  };

  const stepMinutes = (mins) => {
    setSimMinutes((m) => Math.max(0, m + mins));
  };

  const applyWeatherPreset = (preset) => {
    setAutoWeather(false);
    setTempC(preset.temp);
    setHumidity(preset.hum);
    setCloudCover(preset.cloud);
  };

  const handleOperatorSubmit = (e) => {
    e.preventDefault();
    if (!operatorQuery.trim()) return;
    askAdvisor(`USER:${operatorQuery}`);
    setOperatorQuery("");
  };

  const flowActive = gridInputKw > 0.05;
  const dischargeActive = dischargeKw > 0 && isNight;
  const dashOffset = -(flowPulse % 40);

  return (
    <div style={{ maxWidth: "1480px", margin: "0 auto", padding: "20px 24px", color: "#C9D3DC", background: "#080D14", minHeight: "100vh" }}>
      {/* Top Mission Control Strip */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", background: "#0A1017", border: "1px solid #162230",
        borderRadius: "10px", marginBottom: "18px", flexWrap: "wrap", gap: "14px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#F5A623", boxShadow: "0 0 12px #F5A62388" }} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <h1 style={{ fontSize: "19px", fontWeight: 700, margin: 0, color: "#EDF1F5" }}>
                MERIDIAN SOLAR CONTROL CENTER
              </h1>
              <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "4px", background: "rgba(245,166,35,0.15)", color: "#F5A623", border: "1px solid rgba(245,166,35,0.4)" }}>
                GRID-OPS V2.4
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "#6B7A8C", marginTop: "2px" }}>
              Station: GS-01 BESS • Interconnect 13.8kV • Substation Feeder 4A
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "18px", fontSize: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Activity size={14} color="#2DD4BF" />
            <span style={{ color: "#6B7A8C" }}>Freq:</span>
            <span style={{ color: "#2DD4BF", fontWeight: 600 }}>{gridFreqHz.toFixed(2)} Hz</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Thermometer size={14} color="#F5A623" />
            <span style={{ color: "#6B7A8C" }}>BESS:</span>
            <span style={{ color: bessTempC > 32 ? "#F87171" : "#EDF1F5" }}>{bessTempC.toFixed(1)}°C</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: flowActive ? "#4ADE80" : "#F5A623" }} />
            <span style={{ color: flowActive ? "#4ADE80" : "#F5A623", fontSize: "11px" }}>
              {flowActive ? "ONLINE" : isNight ? "NIGHT" : "STANDBY"}
            </span>
          </div>
        </div>
      </div>

      {/* 1. Time Machine & Chrono Controls */}
      <div style={{ background: "#0E1622", borderRadius: "10px", padding: "16px 18px", border: "1px solid #1A2636", marginBottom: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              background: isNight ? "#141F2D" : "rgba(245,166,35,0.15)",
              border: `1px solid ${isNight ? "#243547" : "rgba(245,166,35,0.4)"}`,
              borderRadius: "8px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "8px"
            }}>
              <Clock size={16} color={isNight ? "#5E7CA8" : "#F5A623"} />
              <span style={{ fontSize: "22px", fontWeight: 700, color: "#EDF1F5", fontFamily: "monospace" }}>
                {fmtClock(hourOfDay)}
              </span>
              <span style={{ fontSize: "11px", color: "#6B7A8C" }}>Day {Math.floor(simMinutes / 1440) + 1}</span>
            </div>

            <div style={{ display: "flex", gap: "4px" }}>
              <button style={btnStyle} onClick={() => stepMinutes(-60)}>-1h</button>
              <button style={btnStyle} onClick={() => stepMinutes(-15)}>-15m</button>
              <button style={btnStyle} onClick={() => stepMinutes(15)}>+15m</button>
              <button style={btnStyle} onClick={() => stepMinutes(60)}>+1h</button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "#6B7A8C", marginRight: "4px" }}>Fast Jump:</span>
            {TIME_PRESETS.map((p) => (
              <button
                key={p.label}
                style={{ ...btnStyle, borderColor: Math.abs(hourOfDay - p.hour) < 0.25 ? "#F5A623" : "#243547", color: Math.abs(hourOfDay - p.hour) < 0.25 ? "#F5A623" : "#8E9EAF" }}
                onClick={() => jumpToHour(p.hour)}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ fontSize: "11px", color: "#6B7A8C", marginRight: "4px" }}>Rate:</span>
            {SPEEDS.map((s, i) => (
              <button
                key={s.label}
                style={{ ...btnStyle, borderColor: speedIdx === i && !paused ? "#F5A623" : "#243547", color: speedIdx === i && !paused ? "#F5A623" : "#8E9EAF" }}
                onClick={() => { setSpeedIdx(i); setPaused(false); }}
              >
                {s.label}
              </button>
            ))}
            <button
              style={{ ...btnStyle, borderColor: paused ? "#F87171" : "#243547", color: paused ? "#F87171" : "#8E9EAF" }}
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#6B7A8C", marginBottom: "6px" }}>
            <span>24-Hour Solar Trajectory Scrub</span>
            <span style={{ color: "#F5A623", fontFamily: "monospace" }}>{fmtClock(hourOfDay)} ({((hourOfDay / 24) * 100).toFixed(0)}% of cycle)</span>
          </div>
          <input
            type="range"
            min={0}
            max={23.9}
            step={0.1}
            value={hourOfDay}
            onChange={(e) => jumpToHour(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Main Grid: Left Schematic & Right Subsystems */}
      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "20px", marginBottom: "18px" }}>
        
        {/* Left Column: Visual Schematic & Live Telemetry */}
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          
          <div style={{ background: "#0E1622", borderRadius: "10px", padding: "16px 18px", border: "1px solid #1A2636" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#8E9EAF", textTransform: "uppercase" }}>
                Photovoltaic & Storage Grid Interconnect
              </span>
              <span style={{ fontSize: "11px", color: "#6B7A8C" }}>Technical Loss: {TRANSMISSION_LOSS_PCT}%</span>
            </div>

            <svg viewBox="0 0 540 220" style={{ width: "100%", height: "auto", background: "#060A10", borderRadius: "8px", border: "1px solid #141E2B" }}>
              {/* Farm 01 */}
              <g transform="translate(65, 105)">
                <rect x="-52" y="-42" width="104" height="84" rx="8" fill="#0D1622" stroke="#223244" strokeWidth="1.5" />
                <Sun x="-12" y="-64" width="24" height="24" color={isNight ? "#243447" : "#F5A623"} />
                {Array.from({ length: 6 }).map((_, i) => (
                  <rect
                    key={i}
                    x={-40 + (i % 3) * 28}
                    y={-22 + Math.floor(i / 3) * 26}
                    width="24"
                    height="20"
                    rx="3"
                    fill={outputKw > 0.5 ? "#103220" : "#141E2B"}
                    stroke="#F5A623"
                    strokeOpacity={outputKw > 0.5 ? 0.7 : 0.2}
                    strokeWidth="1.2"
                  />
                ))}
                <text x="0" y="58" textAnchor="middle" fontSize="11" fill="#8493A3" fontWeight="600" fontFamily="monospace">PV FARM 01</text>
                <text x="0" y="70" textAnchor="middle" fontSize="9" fill="#4A5A6B" fontFamily="monospace">{panels} PANELS</text>
              </g>

              {/* Power Line */}
              <line x1="120" y1="105" x2="410" y2="105" stroke="#162434" strokeWidth="4" />
              {flowActive && (
                <line
                  x1="120"
                  y1="105"
                  x2="410"
                  y2="105"
                  stroke="#F5A623"
                  strokeWidth="3.5"
                  strokeDasharray="14 8"
                  strokeDashoffset={dashOffset}
                  opacity="0.9"
                />
              )}
              {dischargeActive && (
                <line
                  x1="410"
                  y1="105"
                  x2="120"
                  y2="105"
                  stroke="#2DD4BF"
                  strokeWidth="3"
                  strokeDasharray="12 6"
                  strokeDashoffset={-dashOffset}
                  opacity="0.85"
                />
              )}

              <g transform="translate(265, 90)">
                <rect x="-65" y="-12" width="130" height="24" rx="12" fill="#0D1622" stroke="#223244" />
                <text x="0" y="4" textAnchor="middle" fontSize="10" fill="#F87171" fontFamily="monospace" fontWeight="500">
                  -{TRANSMISSION_LOSS_PCT}% ({lossKw.toFixed(2)} kW loss)
                </text>
              </g>

              {/* GS-01 Node */}
              <g transform="translate(460, 105)">
                <rect x="-52" y="-48" width="104" height="96" rx="8" fill="#0D1622" stroke="#223244" strokeWidth="1.5" />
                <Zap x="-11" y="-70" width="22" height="22" color="#2DD4BF" />

                <rect x="-38" y="26" width="76" height="12" rx="4" fill="#070C12" stroke="#223244" />
                <rect
                  x="-38"
                  y="26"
                  width={76 * clamp(stationPct, 0, 100) / 100}
                  height="12"
                  rx="4"
                  fill={stationPct > 85 ? "#4ADE80" : stationPct < 15 ? "#F87171" : "#2DD4BF"}
                />

                <rect x="-38" y="-24" width="76" height="42" rx="4" fill="#070C12" stroke="#2DD4BF" strokeOpacity="0.4" />
                <text x="0" y="2" textAnchor="middle" fontSize="16" fill="#EDF1F5" fontFamily="monospace" fontWeight="700">
                  {stationPct.toFixed(0)}%
                </text>
                <text x="0" y="14" textAnchor="middle" fontSize="9" fill="#2DD4BF" fontFamily="monospace">
                  {storedKwh.toFixed(1)} kWh
                </text>

                <text x="0" y="66" textAnchor="middle" fontSize="11" fill="#8493A3" fontWeight="600" fontFamily="monospace">GRID STATION</text>
                <text x="0" y="78" textAnchor="middle" fontSize="9" fill="#2DD4BF" fontFamily="monospace">GS-01 BESS</text>
              </g>
            </svg>

            {/* 5. Telemetry Strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginTop: "14px" }}>
              <div style={telemetryBoxStyle}>
                <div style={{ fontSize: "10px", color: "#6B7A8C", textTransform: "uppercase" }}>PV Generation</div>
                <div style={{ fontSize: "17px", color: "#F5A623", fontWeight: 700, fontFamily: "monospace", marginTop: "2px" }}>
                  {outputKw.toFixed(2)} kW
                </div>
              </div>
              <div style={telemetryBoxStyle}>
                <div style={{ fontSize: "10px", color: "#6B7A8C", textTransform: "uppercase" }}>Reaching Grid</div>
                <div style={{ fontSize: "17px", color: "#2DD4BF", fontWeight: 700, fontFamily: "monospace", marginTop: "2px" }}>
                  {gridInputKw.toFixed(2)} kW
                </div>
              </div>
              <div style={telemetryBoxStyle}>
                <div style={{ fontSize: "10px", color: "#6B7A8C", textTransform: "uppercase" }}>BESS Net Intake</div>
                <div style={{ fontSize: "17px", color: chargeKw > 0 ? "#4ADE80" : "#8493A3", fontWeight: 700, fontFamily: "monospace", marginTop: "2px" }}>
                  {chargeKw > 0 ? `+${chargeKw.toFixed(2)} kW` : dischargeKw > 0 ? `-${dischargeKw.toFixed(2)} kW` : "0.00 kW"}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginTop: "10px" }}>
              <div style={telemetryBoxStyle}>
                <div style={{ fontSize: "10px", color: "#6B7A8C", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Battery size={12} /> Capacity
                </div>
                <div style={{ fontSize: "14px", color: "#EDF1F5", fontWeight: 600, fontFamily: "monospace", marginTop: "2px" }}>
                  {storedKwh.toFixed(1)} / {stationCapacityKwh} kWh
                </div>
              </div>
              <div style={telemetryBoxStyle}>
                <div style={{ fontSize: "10px", color: curtailedKw > 0.05 ? "#F87171" : "#6B7A8C", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Gauge size={12} /> {curtailedKw > 0.05 ? "⚠ Curtailment" : "Intake Ceiling"}
                </div>
                <div style={{ fontSize: "14px", color: curtailedKw > 0.05 ? "#F87171" : "#8493A3", fontWeight: 600, fontFamily: "monospace", marginTop: "2px" }}>
                  {curtailedKw > 0.05 ? `${curtailedKw.toFixed(2)} kW` : `${stationChargeRateKw} kW`}
                </div>
              </div>
              <div style={telemetryBoxStyle}>
                <div style={{ fontSize: "10px", color: "#6B7A8C", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Leaf size={12} color="#4ADE80" /> Carbon Offset
                </div>
                <div style={{ fontSize: "14px", color: "#4ADE80", fontWeight: 600, fontFamily: "monospace", marginTop: "2px" }}>
                  {co2AvoidedKg} kg CO₂
                </div>
              </div>
            </div>
          </div>

          {/* 5. Multi-Layer Area Chart */}
          <div style={{ background: "#0E1622", borderRadius: "10px", padding: "16px 18px", border: "1px solid #1A2636" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#8E9EAF", textTransform: "uppercase" }}>
                Live Rolling Telemetry Stream
              </span>
              <div style={{ display: "flex", gap: "14px", fontSize: "11px" }}>
                <span style={{ color: "#F5A623" }}>■ PV Output</span>
                <span style={{ color: "#2DD4BF" }}>■ Grid Delivered</span>
                <span style={{ color: "#4ADE80" }}>■ BESS SoC</span>
              </div>
            </div>
            <div style={{ height: "170px", width: "100%" }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorOutput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F5A623" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#F5A623" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#4A5A6B" }} axisLine={{ stroke: "#1C2836" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#4A5A6B" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#070D14", border: "1px solid #1E2D3D", borderRadius: "6px", fontSize: "11px" }} />
                  <Area type="monotone" dataKey="output" stroke="#F5A623" fillOpacity={1} fill="url(#colorOutput)" strokeWidth={2} name="PV Output (kW)" isAnimationActive={false} />
                  <Line type="monotone" dataKey="grid" stroke="#2DD4BF" strokeWidth={2} dot={false} name="Grid Delivered (kW)" isAnimationActive={false} />
                  <Line type="monotone" dataKey="battery" stroke="#4ADE80" strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="Battery (kWh)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Column: Controls & AI Terminal */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* 2. Dispatch Strategy */}
          <div style={{ background: "#0E1622", borderRadius: "10px", padding: "16px 18px", border: "1px solid #1A2636" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#8E9EAF", textTransform: "uppercase", marginBottom: "10px" }}>
              BESS Dispatch Strategy
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {["AUTO", "BUFFER_FIRST", "PEAK_SHAVING", "CONSERVE"].map((mode) => (
                <button
                  key={mode}
                  style={{
                    fontSize: "11px", padding: "6px 10px", borderRadius: "6px",
                    border: dispatchMode === mode ? "1px solid #2DD4BF" : "1px solid #223244",
                    background: dispatchMode === mode ? "rgba(45, 212, 191, 0.12)" : "#101926",
                    color: dispatchMode === mode ? "#2DD4BF" : "#8493A3",
                    cursor: "pointer", fontWeight: dispatchMode === mode ? 600 : 400
                  }}
                  onClick={() => setDispatchMode(mode)}
                >
                  {mode.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Weather Simulation & Presets */}
          <div style={{ background: "#0E1622", borderRadius: "10px", padding: "16px 18px", border: "1px solid #1A2636" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#8E9EAF", textTransform: "uppercase" }}>
                Atmospheric Simulation
              </span>
              <button style={{ ...btnStyle, fontSize: "10px" }} onClick={() => setAutoWeather((a) => !a)}>
                {autoWeather ? "● Auto Drift" : "○ Manual"}
              </button>
            </div>

            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "12px" }}>
              {WEATHER_PRESETS.map((wp) => (
                <button
                  key={wp.label}
                  style={{ ...btnStyle, fontSize: "10px", padding: "3px 6px" }}
                  onClick={() => applyWeatherPreset(wp)}
                >
                  {wp.label}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#8493A3", marginBottom: "2px" }}>
                <span>Temp</span><span style={{ fontFamily: "monospace" }}>{tempC.toFixed(1)}°C</span>
              </div>
              <input type="range" min={5} max={48} step={0.5} value={tempC} disabled={autoWeather} onChange={(e) => setTempC(Number(e.target.value))} />
            </div>

            <div style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#8493A3", marginBottom: "2px" }}>
                <span>Clouds</span><span style={{ fontFamily: "monospace" }}>{cloudCover.toFixed(0)}%</span>
              </div>
              <input type="range" min={0} max={100} value={cloudCover} disabled={autoWeather} onChange={(e) => setCloudCover(Number(e.target.value))} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#8493A3", marginBottom: "2px" }}>
                <span>Dust / Soiling</span><span style={{ fontFamily: "monospace" }}>{soilingLoss.toFixed(0)}%</span>
              </div>
              <input type="range" min={0} max={25} value={soilingLoss} onChange={(e) => setSoilingLoss(Number(e.target.value))} />
            </div>
          </div>

          {/* Infrastructure Scaling */}
          <div style={{ background: "#0E1622", borderRadius: "10px", padding: "16px 18px", border: "1px solid #1A2636" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#8E9EAF", textTransform: "uppercase", marginBottom: "10px" }}>
              Infrastructure Scaling
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div>
                <div style={{ fontSize: "18px", color: "#EDF1F5", fontWeight: 600, fontFamily: "monospace" }}>
                  {panels} panels
                </div>
                <div style={{ fontSize: "11px", color: "#F5A623" }}>{capacityKw.toFixed(1)} kW Capacity</div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button style={btnStyle} onClick={() => installPanels(-5)} disabled={panels <= MIN_PANELS}>-5</button>
                <button style={{ ...btnStyle, borderColor: "#F5A623", color: "#F5A623" }} onClick={() => installPanels(5)} disabled={panels >= MAX_PANELS}>+5</button>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "18px", color: "#EDF1F5", fontWeight: 600, fontFamily: "monospace" }}>
                  {modules} / {MAX_MODULES} BESS modules
                </div>
                <div style={{ fontSize: "11px", color: "#2DD4BF" }}>{stationCapacityKwh} kWh • {stationChargeRateKw} kW rate</div>
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button style={btnStyle} onClick={() => installModules(-1)} disabled={modules <= 0}>-1</button>
                <button style={{ ...btnStyle, borderColor: "#2DD4BF", color: "#2DD4BF" }} onClick={() => installModules(1)} disabled={modules >= MAX_MODULES}>+1</button>
              </div>
            </div>
          </div>

          {/* 4. AI Operations Terminal */}
          <div style={{ background: "#0E1622", borderRadius: "10px", padding: "16px 18px", border: "1px solid #1A2636", flexGrow: 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Sparkles size={16} color="#F5A623" />
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#EDF1F5", textTransform: "uppercase" }}>
                  AI Operations Terminal
                </span>
              </div>
              <button onClick={() => askAdvisor("Operator initiated diagnostic")} disabled={advisoryLoading} style={{ ...btnStyle, borderColor: "#F5A62388", color: "#F5A623" }}>
                {advisoryLoading ? "Analyzing…" : "⚡ Run Diagnostics"}
              </button>
            </div>

            <form onSubmit={handleOperatorSubmit} style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
              <input
                type="text"
                placeholder="Ask AI dispatcher (e.g. 'projected endurance', 'curtailment')..."
                value={operatorQuery}
                onChange={(e) => setOperatorQuery(e.target.value)}
                style={{
                  flex: 1, background: "#070C12", border: "1px solid #1E2D3D",
                  borderRadius: "6px", padding: "6px 10px", fontSize: "11px", color: "#EDF1F5", outline: "none"
                }}
              />
              <button type="submit" style={{ ...btnStyle, background: "rgba(245,166,35,0.15)", borderColor: "#F5A623", color: "#F5A623" }}>
                Ask
              </button>
            </form>

            <div style={{ maxHeight: "170px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {advisories.map((a) => (
                <div key={a.id} style={{
                  borderLeft: `3px solid ${a.reason.includes("Operator") ? "#2DD4BF" : "#F5A623"}`,
                  background: "#070C12", padding: "8px 10px", borderRadius: "0 6px 6px 0"
                }}>
                  <div style={{ display: "flex", gap: "6px", alignItems: "baseline", marginBottom: "2px" }}>
                    <span style={{ fontSize: "10px", color: a.reason.includes("Operator") ? "#2DD4BF" : "#F5A623", fontWeight: 700, fontFamily: "monospace" }}>{a.time}</span>
                    <span style={{ fontSize: "9px", color: "#6B7A8C", textTransform: "uppercase" }}>• {a.reason}</span>
                  </div>
                  <div style={{ fontSize: "12px", lineHeight: 1.45, color: "#C9D3DC" }}>{a.text}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  fontSize: "11px",
  padding: "4px 8px",
  borderRadius: "5px",
  border: "1px solid #243547",
  background: "#121C2B",
  color: "#8E9EAF",
  cursor: "pointer",
  fontFamily: "monospace"
};

const telemetryBoxStyle = {
  background: "#090E16",
  borderRadius: "8px",
  padding: "10px 14px",
  border: "1px solid #162230"
};
