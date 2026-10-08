import { SolarFarm, WeatherState } from '../types';

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function formatTime(simHours: number): string {
  const norm = ((simHours % 24) + 24) % 24;
  const hours = Math.floor(norm);
  const minutes = Math.floor((norm % 1) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isNightTime(simHours: number): boolean {
  const h = ((simHours % 24) + 24) % 24;
  // User requirement: after 5 pm (17:00) and till 7 am (07:00)
  return h >= 17.0 || h < 7.0;
}

export function calculateSunElevation(simHours: number): number {
  const h = ((simHours % 24) + 24) % 24;
  if (h < 5.75 || h > 18.5) return 0;
  // Peaks at 12:00
  const normalized = (h - 5.75) / (18.5 - 5.75);
  return Math.sin(normalized * Math.PI);
}

export function calculateFarmOutput(
  farm: SolarFarm,
  simHours: number,
  weather: WeatherState
): number {
  const sunElev = calculateSunElevation(simHours);
  if (sunElev <= 0) return 0;

  // Tracker bonus
  let trackerFactor = sunElev;
  if (farm.trackerType === 'Single-Axis Tracker') {
    trackerFactor = Math.pow(sunElev, 0.72) * 1.15;
  } else if (farm.trackerType === 'Dual-Axis Tracker') {
    trackerFactor = Math.pow(sunElev, 0.60) * 1.25;
  }

  // Cloud loss
  const cloudMultiplier = clamp(1 - (weather.cloudCoverPct / 100) * 0.82, 0.12, 1.0);

  // Temp coefficient (-0.38% per °C above 25°C)
  let tempMultiplier = 1.0;
  if (weather.ambientTempC > 25) {
    tempMultiplier = 1.0 - (weather.ambientTempC - 25) * 0.0038;
  } else if (weather.ambientTempC < 10) {
    tempMultiplier = 1.0 - (10 - weather.ambientTempC) * 0.01;
  }
  tempMultiplier = clamp(tempMultiplier, 0.6, 1.05);

  // Inverter & soiling
  const soilingMultiplier = 1.0 - (farm.soilingLossPct / 100);
  const inverterMultiplier = farm.efficiencyPct / 100;

  const totalDcCapacityKw = (farm.panels * farm.panelWattageW) / 1000;
  const rawAcKw = totalDcCapacityKw * trackerFactor * cloudMultiplier * tempMultiplier * soilingMultiplier * inverterMultiplier;

  return Math.max(0, Number(rawAcKw.toFixed(1)));
}

export function calculateDistanceKm(
  coordA: { x: number; y: number },
  coordB: { x: number; y: number }
): number {
  const dx = coordA.x - coordB.x;
  const dy = coordA.y - coordB.y;
  // Scale: 100x100 canvas maps to urban grid; 0.35 factor accounts for city street routing
  const euclidean = Math.sqrt(dx * dx + dy * dy);
  return Math.max(1.5, Number((euclidean * 0.35).toFixed(1)));
}

/**
 * Realistic Electric Truck Battery Consumption:
 * - Base rate: 0.82 kWh/km (tare weight, powertrain, auxiliaries)
 * - Cargo rate: +0.16 kWh/km per 1,000 kg of payload
 * A 150 kWh battery truck traveling 10 km empty drains ~8.2 kWh (5.5%).
 * With 2,500 kg of cargo, it drains ~12.2 kWh (8.1%).
 */
export function calculateLegEnergyConsumption(
  distanceKm: number,
  cargoWeightKg: number
): { kwh: number; ratePerKm: number } {
  const baseRate = 0.82;
  const weightRate = (cargoWeightKg / 1000) * 0.16;
  const ratePerKm = baseRate + weightRate;
  const kwh = Number((distanceKm * ratePerKm).toFixed(2));
  return { kwh, ratePerKm: Number(ratePerKm.toFixed(2)) };
}

