import { DeliveryPoint, Truck, ServiceClass, ExtraServiceId, OrderPricing, MerchantOrder, RouteLeg } from '../types';
import { calculateDistanceKm } from './solarPhysics';
import { DEPOT_COORDS, EXTRA_SERVICES_CATALOG } from '../data/initialState';

export const BASE_PER_KM_RATE = 24.0; // ₹24 / km
export const BASE_PER_KG_RATE = 4.5;  // ₹4.5 / kg
export const GST_RATE_PCT = 18;       // 18% GST
export const AVG_FLEET_SPEED_KMH = 38; // Average suburban fleet speed km/h

/**
 * Calculates complete transparent pricing for a delivery request
 */
export function calculateOrderPricing(
  originPoint: DeliveryPoint,
  destPoint: DeliveryPoint,
  weightKg: number,
  requiredService: ServiceClass,
  extraServices: ExtraServiceId[]
): OrderPricing {
  const distanceKm = Number(calculateDistanceKm(originPoint.coords, destPoint.coords).toFixed(1));

  // Service multiplier (e.g. cold chain / heavy haul specialized equipment)
  let serviceMultiplier = 1.0;
  if (requiredService === 'cold-chain') serviceMultiplier = 1.25;
  if (requiredService === 'heavy-haul') serviceMultiplier = 1.20;
  if (requiredService === 'fragile-secure') serviceMultiplier = 1.22;
  if (requiredService === 'express-rapid') serviceMultiplier = 1.18;

  const perKmRate = Number((BASE_PER_KM_RATE * serviceMultiplier).toFixed(2));
  const perKgRate = BASE_PER_KG_RATE;

  const baseDistanceFare = Number((distanceKm * perKmRate).toFixed(2));
  const weightFare = Number((weightKg * perKgRate).toFixed(2));

  // Extra service add-on calculation
  let extraServicesFare = 0;
  for (const svcId of extraServices) {
    const opt = EXTRA_SERVICES_CATALOG.find((s) => s.id === svcId);
    if (opt) {
      if (opt.surchargeType === 'percentage' && opt.percentageVal) {
        extraServicesFare += (baseDistanceFare + weightFare) * (opt.percentageVal / 100);
      } else {
        extraServicesFare += opt.surchargeAmount;
      }
    }
  }
  extraServicesFare = Number(extraServicesFare.toFixed(2));

  const subtotal = Number((baseDistanceFare + weightFare + extraServicesFare).toFixed(2));
  const gstAmount = Number(((subtotal * GST_RATE_PCT) / 100).toFixed(2));
  const totalAmount = Number((subtotal + gstAmount).toFixed(2));

  return {
    distanceKm,
    perKmRate,
    perKgRate,
    baseDistanceFare,
    weightFare,
    extraServicesFare,
    subtotal,
    gstRatePct: GST_RATE_PCT,
    gstAmount,
    totalAmount
  };
}

/**
 * Calculates the early departure time needed from the central depot/bay
 * to reach the merchant's origin pickup point exactly on time.
 */
export function calculateEarlyDispatchTime(
  originCoords: { x: number; y: number },
  scheduledPickupTimeHours: number
): { calculatedDispatchTimeHours: number; transitMinutesFromBay: number; distanceToOriginKm: number } {
  const distanceToOriginKm = calculateDistanceKm(DEPOT_COORDS, originCoords);
  // Time in hours = distance / speed
  const transitHours = distanceToOriginKm / AVG_FLEET_SPEED_KMH;
  const transitMinutesFromBay = Math.max(5, Math.round(transitHours * 60));

  let calculatedDispatchTimeHours = scheduledPickupTimeHours - (transitMinutesFromBay / 60);
  if (calculatedDispatchTimeHours < 0) {
    calculatedDispatchTimeHours += 24;
  }

  return {
    calculatedDispatchTimeHours: Number(calculatedDispatchTimeHours.toFixed(2)),
    transitMinutesFromBay,
    distanceToOriginKm: Number(distanceToOriginKm.toFixed(1))
  };
}

/**
 * AI Truck Allocation: Picks the best available EV truck that matches:
 * 1. Required capability/service specialization (e.g. cold storage unit, heavy chassis, fragile air-ride)
 * 2. Payload capacity >= order weight
 * 3. Sufficient battery SoC and available at depot (or queued)
 */
export function autoAssignTruckForOrder(
  trucks: Truck[],
  requiredService: ServiceClass,
  weightKg: number
): Truck | null {
  // 1. Strict filter: must support service capability & carry the weight
  let candidates = trucks.filter((t) => {
    const typeMatches =
      t.specialization.serviceType === requiredService ||
      (requiredService === 'standard' && t.specialization.serviceType === 'standard');
    const hasCapacity = t.specialization.maxPayloadKg >= weightKg;
    const isFree = !t.route; // Not currently on an active mission
    return typeMatches && hasCapacity && isFree;
  });

  // If no exact match, allow a higher-tier truck with sufficient payload if standard was requested
  if (candidates.length === 0 && requiredService === 'standard') {
    candidates = trucks.filter(
      (t) => t.specialization.maxPayloadKg >= weightKg && !t.route
    );
  }

  if (candidates.length === 0) return null;

  // Sort candidates:
  // 1st: Available at Depot with highest SoC
  // 2nd: Charging with SoC > 70%
  // 3rd: Any other
  candidates.sort((a, b) => {
    const aDepot = a.opStatus === 'Available at Depot' ? 2 : a.opStatus === 'Charging (Fast DC)' ? 1 : 0;
    const bDepot = b.opStatus === 'Available at Depot' ? 2 : b.opStatus === 'Charging (Fast DC)' ? 1 : 0;
    if (aDepot !== bDepot) return bDepot - aDepot;
    return b.soc - a.soc;
  });

  return candidates[0];
}

/**
 * Generates an accurate 3-stage dispatch mission for an order:
 * Stage 0: Depot Bay -> Merchant Origin Pickup Point (leaves early to arrive on-time)
 * Stage 1: Merchant Origin Pickup Point -> Merchant Destination Dropoff Point (loaded cargo)
 * Stage 2: Destination Dropoff Point -> Depot Bay (return to charge & stand by)
 */
export function generateOrderRoute(
  depotCoords: { x: number; y: number; lat: number; lng: number },
  originDP: DeliveryPoint,
  destDP: DeliveryPoint,
  weightKg: number,
  boxCount: number
) {
  const d1 = calculateDistanceKm(depotCoords, originDP.coords);
  const d2 = calculateDistanceKm(originDP.coords, destDP.coords);
  const d3 = calculateDistanceKm(destDP.coords, depotCoords);

  const legs: RouteLeg[] = [
    {
      legIndex: 0,
      fromPointId: 'depot',
      fromCoords: { ...depotCoords },
      fromName: 'Meridian Central Depot (Bay)',
      toPointId: originDP.id,
      toCoords: { ...originDP.coords },
      toName: `${originDP.name} (${originDP.code})`,
      distanceKm: Number(d1.toFixed(1)),
      cargoWeightKg: 0,
      boxCount: 0,
      boxTypeName: 'Tare (Repositioning)',
      actionDescription: `Early departure from Depot to arrive at ${originDP.code}`,
      completed: false
    },
    {
      legIndex: 1,
      fromPointId: originDP.id,
      fromCoords: { ...originDP.coords },
      fromName: `${originDP.name} (${originDP.code})`,
      toPointId: destDP.id,
      toCoords: { ...destDP.coords },
      toName: `${destDP.name} (${destDP.code})`,
      distanceKm: Number(d2.toFixed(1)),
      cargoWeightKg: weightKg,
      boxCount: boxCount,
      boxTypeName: 'Merchant Freight',
      actionDescription: `Loaded delivery from ${originDP.code} to ${destDP.code}`,
      completed: false
    },
    {
      legIndex: 2,
      fromPointId: destDP.id,
      fromCoords: { ...destDP.coords },
      fromName: `${destDP.name} (${destDP.code})`,
      toPointId: 'depot',
      toCoords: { ...depotCoords },
      toName: 'Meridian Central Depot (Bay)',
      distanceKm: Number(d3.toFixed(1)),
      cargoWeightKg: 0,
      boxCount: 0,
      boxTypeName: 'Empty Return',
      actionDescription: 'Return to Central Depot for battery recharge',
      completed: false
    }
  ];

  const totalDistanceKm = Number((d1 + d2 + d3).toFixed(1));

  return {
    legs,
    totalDistanceKm
  };
}

