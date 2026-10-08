import { DeliveryPoint, Truck, ServiceClass, ExtraServiceId, OrderPricing, RouteLeg, StopPricingBreakdown, OrderDeliveryStop } from '../types';
import { calculateDistanceKm } from './solarPhysics';
import { DEPOT_COORDS, EXTRA_SERVICES_CATALOG } from '../data/initialState';

export const BASE_PER_KM_RATE = 24.0; // ₹24 / km
export const BASE_PER_KG_RATE = 4.5;  // ₹4.5 / kg
export const GST_RATE_PCT = 18;       // 18% GST
export const AVG_FLEET_SPEED_KMH = 38; // Average suburban fleet speed km/h

export interface DeliveryStopInput {
  deliveryPoint: DeliveryPoint;
  cargoWeightKg: number;
  boxCount?: number;
}

/**
 * Helper to get the service multiplier for pricing based on vehicle specialization class
 */
export function getServiceTariffMultiplier(serviceClass: ServiceClass): number {
  switch (serviceClass) {
    case 'refrigerated-cryo':
    case 'cold-chain':
      return 1.25;
    case 'heavy-duty-flatbed':
    case 'heavy-haul':
      return 1.20;
    case 'air-ride-vault':
    case 'fragile-secure':
      return 1.22;
    case 'express-sprinter':
    case 'express-rapid':
      return 1.18;
    case 'standard-dry-van':
    case 'standard':
    default:
      return 1.00;
  }
}

/**
 * Calculates complete transparent pricing for a multi-stop delivery request (up to 3 deliveries)
 * Breaks down billing per stop: leg distance fare + cargo weight fare.
 */
export function calculateMultiStopPricing(
  originPoint: DeliveryPoint,
  deliveries: DeliveryStopInput[],
  requiredService: ServiceClass,
  extraServices: ExtraServiceId[] = []
): OrderPricing {
  const serviceMultiplier = getServiceTariffMultiplier(requiredService);
  const perKmRate = Number((BASE_PER_KM_RATE * serviceMultiplier).toFixed(2));
  const perKgRate = BASE_PER_KG_RATE;

  let totalDistanceKm = 0;
  let totalBaseDistanceFare = 0;
  let totalWeightFare = 0;
  const stopBreakdown: StopPricingBreakdown[] = [];

  let previousCoords = originPoint.coords;

  deliveries.forEach((delivery, index) => {
    const legDist = Number(calculateDistanceKm(previousCoords, delivery.deliveryPoint.coords).toFixed(1));
    totalDistanceKm += legDist;

    const distanceFare = Number((legDist * perKmRate).toFixed(2));
    const weightFare = Number((delivery.cargoWeightKg * perKgRate).toFixed(2));
    const stopSubtotal = Number((distanceFare + weightFare).toFixed(2));

    totalBaseDistanceFare += distanceFare;
    totalWeightFare += weightFare;

    stopBreakdown.push({
      stopIndex: index,
      pointId: delivery.deliveryPoint.id,
      pointName: delivery.deliveryPoint.name,
      weightKg: delivery.cargoWeightKg,
      legDistanceKm: legDist,
      distanceFare,
      weightFare,
      stopSubtotal
    });

    // Advance previous coords for next leg
    previousCoords = delivery.deliveryPoint.coords;
  });

  // Calculate Extra Services surcharge
  let extraServicesFare = 0;
  for (const svcId of extraServices) {
    const opt = EXTRA_SERVICES_CATALOG.find((s) => s.id === svcId);
    if (opt) {
      if (opt.surchargeType === 'percentage' && opt.percentageVal) {
        extraServicesFare += (totalBaseDistanceFare + totalWeightFare) * (opt.percentageVal / 100);
      } else {
        extraServicesFare += opt.surchargeAmount;
      }
    }
  }
  extraServicesFare = Number(extraServicesFare.toFixed(2));

  const subtotal = Number((totalBaseDistanceFare + totalWeightFare + extraServicesFare).toFixed(2));
  const gstAmount = Number(((subtotal * GST_RATE_PCT) / 100).toFixed(2));
  const totalAmount = Number((subtotal + gstAmount).toFixed(2));

  return {
    distanceKm: Number(totalDistanceKm.toFixed(1)),
    perKmRate,
    perKgRate,
    baseDistanceFare: Number(totalBaseDistanceFare.toFixed(2)),
    weightFare: Number(totalWeightFare.toFixed(2)),
    extraServicesFare,
    subtotal,
    gstRatePct: GST_RATE_PCT,
    gstAmount,
    totalAmount,
    stopBreakdown
  };
}

/**
 * Backwards-compatible single-destination pricing wrapper
 */
export function calculateOrderPricing(
  originPoint: DeliveryPoint,
  destPoint: DeliveryPoint,
  weightKg: number,
  requiredService: ServiceClass,
  extraServices: ExtraServiceId[] = []
): OrderPricing {
  return calculateMultiStopPricing(
    originPoint,
    [{ deliveryPoint: destPoint, cargoWeightKg: weightKg }],
    requiredService,
    extraServices
  );
}

/**
 * Calculates the early departure time needed from the central depot/bay
 * to reach the merchant's origin pickup point on time.
 */
export function calculateEarlyDispatchTime(
  originCoords: { x: number; y: number },
  scheduledPickupTimeHours: number
): { calculatedDispatchTimeHours: number; transitMinutesFromBay: number; distanceToOriginKm: number } {
  const distanceToOriginKm = calculateDistanceKm(DEPOT_COORDS, originCoords);
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
 * 1. Required specialization class
 * 2. Payload capacity >= total cargo weight across all stops
 * 3. Free of route (not currently dispatched)
 */
export function autoAssignTruckForOrder(
  trucks: Truck[],
  requiredService: ServiceClass,
  totalWeightKg: number
): Truck | null {
  // Normalize service matching
  const matchesClass = (truckService: ServiceClass, target: ServiceClass) => {
    if (truckService === target) return true;
    if ((target === 'refrigerated-cryo' || target === 'cold-chain') && (truckService === 'refrigerated-cryo' || truckService === 'cold-chain')) return true;
    if ((target === 'heavy-duty-flatbed' || target === 'heavy-haul') && (truckService === 'heavy-duty-flatbed' || truckService === 'heavy-haul')) return true;
    if ((target === 'air-ride-vault' || target === 'fragile-secure') && (truckService === 'air-ride-vault' || truckService === 'fragile-secure')) return true;
    if ((target === 'express-sprinter' || target === 'express-rapid') && (truckService === 'express-sprinter' || truckService === 'express-rapid')) return true;
    if ((target === 'standard-dry-van' || target === 'standard') && (truckService === 'standard-dry-van' || truckService === 'standard')) return true;
    return false;
  };

  let candidates = trucks.filter((t) => {
    const typeMatches = matchesClass(t.specialization.serviceType, requiredService);
    const hasCapacity = t.specialization.maxPayloadKg >= totalWeightKg;
    const isFree = !t.route && t.opStatus !== 'Dispatched - En Route';
    return typeMatches && hasCapacity && isFree;
  });

  // Fallback for standard if no standard available
  if (candidates.length === 0 && (requiredService === 'standard' || requiredService === 'standard-dry-van')) {
    candidates = trucks.filter((t) => t.specialization.maxPayloadKg >= totalWeightKg && !t.route && t.opStatus !== 'Dispatched - En Route');
  }

  if (candidates.length === 0) return null;

  // Rank by highest SoC and depot availability
  candidates.sort((a, b) => {
    const aDepot = a.opStatus === 'Available at Depot' ? 2 : a.opStatus === 'Charging (Fast DC)' ? 1 : 0;
    const bDepot = b.opStatus === 'Available at Depot' ? 2 : b.opStatus === 'Charging (Fast DC)' ? 1 : 0;
    if (aDepot !== bDepot) return bDepot - aDepot;
    return b.soc - a.soc;
  });

  return candidates[0];
}

/**
 * Generates an accurate multi-route dispatch mission (supports 1 to 3 delivery stops):
 * Leg 0: Central Depot -> Merchant Origin (Tare repositioning)
 * Leg 1..N: Sequential delivery stops (carrying active cargo, offloading at each stop)
 * Leg Final: Last delivery stop -> Central Depot (Empty return to depot for charge & standby)
 */
export function generateMultiStopOrderRoute(
  depotCoords: { x: number; y: number; lat: number; lng: number },
  originDP: DeliveryPoint,
  deliveries: Array<{ deliveryPoint: DeliveryPoint; cargoWeightKg: number; boxCount?: number }>,
  orderId?: string
) {
  const legs: RouteLeg[] = [];
  let totalDistanceKm = 0;

  // Compute total cargo weight and total box count loaded at origin
  const totalWeightKg = deliveries.reduce((acc, d) => acc + (d.cargoWeightKg || 0), 0);
  const totalBoxCount = deliveries.reduce((acc, d) => acc + (d.boxCount || 1), 0);

  // Leg 0: Depot -> Origin (Empty tare early departure)
  const d0 = calculateDistanceKm(depotCoords, originDP.coords);
  totalDistanceKm += d0;
  legs.push({
    legIndex: 0,
    fromPointId: 'depot',
    fromCoords: { ...depotCoords },
    fromName: 'Meridian Central Depot (Bay)',
    toPointId: originDP.id,
    toCoords: { ...originDP.coords },
    toName: `${originDP.name} (${originDP.code})`,
    distanceKm: Number(d0.toFixed(1)),
    cargoWeightKg: 0,
    boxCount: 0,
    boxTypeName: 'Tare Repositioning',
    actionDescription: `Early departure from Depot to pickup freight at ${originDP.code}`,
    completed: false
  });

  // Track cargo on truck: starts with all deliveries loaded at origin
  let currentCargoWeight = totalWeightKg;
  let currentBoxCount = totalBoxCount;
  let currentCoords = originDP.coords;
  let currentName = `${originDP.name} (${originDP.code})`;
  let currentPointId: number | 'depot' = originDP.id;

  deliveries.forEach((stop, index) => {
    const dLeg = calculateDistanceKm(currentCoords, stop.deliveryPoint.coords);
    totalDistanceKm += dLeg;

    const stopBoxes = stop.boxCount || Math.max(1, Math.round(stop.cargoWeightKg / 50));

    legs.push({
      legIndex: legs.length,
      fromPointId: currentPointId,
      fromCoords: { ...currentCoords },
      fromName: currentName,
      toPointId: stop.deliveryPoint.id,
      toCoords: { ...stop.deliveryPoint.coords },
      toName: `${stop.deliveryPoint.name} (${stop.deliveryPoint.code})`,
      distanceKm: Number(dLeg.toFixed(1)),
      cargoWeightKg: currentCargoWeight,
      boxCount: currentBoxCount,
      boxTypeName: `Delivery Stop ${index + 1}/${deliveries.length}`,
      actionDescription: `Deliver ${stop.cargoWeightKg} kg (${stopBoxes} pkgs) to ${stop.deliveryPoint.code}`,
      completed: false
    });

    // Offload this stop's cargo for the next leg
    currentCargoWeight = Math.max(0, currentCargoWeight - stop.cargoWeightKg);
    currentBoxCount = Math.max(0, currentBoxCount - stopBoxes);
    currentCoords = stop.deliveryPoint.coords;
    currentName = `${stop.deliveryPoint.name} (${stop.deliveryPoint.code})`;
    currentPointId = stop.deliveryPoint.id;
  });

  // Final Leg: Last delivery point -> Return to Central Depot (Empty)
  const dFinal = calculateDistanceKm(currentCoords, depotCoords);
  totalDistanceKm += dFinal;
  legs.push({
    legIndex: legs.length,
    fromPointId: currentPointId,
    fromCoords: { ...currentCoords },
    fromName: currentName,
    toPointId: 'depot',
    toCoords: { ...depotCoords },
    toName: 'Meridian Central Depot (Bay)',
    distanceKm: Number(dFinal.toFixed(1)),
    cargoWeightKg: 0,
    boxCount: 0,
    boxTypeName: 'Empty Return',
    actionDescription: 'Return to Central Depot for battery recharge & staging',
    completed: false
  });

  return {
    legs,
    totalDistanceKm: Number(totalDistanceKm.toFixed(1))
  };
}

/**
 * Backwards-compatible generateOrderRoute
 */
export function generateOrderRoute(
  depotCoords: { x: number; y: number; lat: number; lng: number },
  originDP: DeliveryPoint,
  destDP: DeliveryPoint,
  weightKg: number,
  boxCount: number
) {
  return generateMultiStopOrderRoute(
    depotCoords,
    originDP,
    [{ deliveryPoint: destDP, cargoWeightKg: weightKg, boxCount }]
  );
}
