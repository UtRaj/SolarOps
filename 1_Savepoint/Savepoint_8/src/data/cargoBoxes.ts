import { BoxTypeConfig, RouteLeg, DeliveryPoint } from '../types';
import { calculateDistanceKm } from '../utils/solarPhysics';

export const BOX_TYPES: BoxTypeConfig[] = [
  {
    id: 'industrial',
    name: 'Heavy Industrial Machinery Crates',
    unitWeightKg: 45,
    description: 'Robotic arm assemblies, solar inverters & cast iron frames',
    iconType: 'industrial'
  },
  {
    id: 'standard',
    name: 'Standard E-Commerce Parcels',
    unitWeightKg: 15,
    description: 'Consumer electronics, retail inventory & assorted packages',
    iconType: 'box'
  },
  {
    id: 'medical',
    name: 'Refrigerated Pharma & Vaccines',
    unitWeightKg: 25,
    description: 'Temperature-monitored biologics, medical kits & dry ice cases',
    iconType: 'medical'
  },
  {
    id: 'dense',
    name: 'High-Density Structural Castings',
    unitWeightKg: 80,
    description: 'Solid steel ingots, lithium cell packs & precision hardware',
    iconType: 'dense'
  },
  {
    id: 'express',
    name: 'Rapid Express Air Cartons',
    unitWeightKg: 8,
    description: 'Priority courier mail, express docs & micro-components',
    iconType: 'express'
  }
];

export interface RouteLegPlan {
  legs: RouteLeg[];
  totalDistanceKm: number;
  totalInitialWeightKg: number;
  totalBoxes: number;
}

/**
 * Builds the complete sequence of physical legs for a delivery mission:
 * Leg 0: Depot -> Pickup Point (Empty tare: 0 kg cargo)
 * Leg 1..N: Pickup -> Delivery 1 -> Delivery 2 -> ... (Carries decreasing payload as deliveries occur)
 * Final Leg: Last Delivery Point -> Central Depot (Empty return: 0 kg cargo)
 */
export function generateRouteLegs(
  depotCoords: { x: number; y: number; lat: number; lng: number },
  pickupPoint: DeliveryPoint,
  deliveryPoints: DeliveryPoint[],
  boxConfig: BoxTypeConfig,
  boxCount: number
): RouteLegPlan {
  const totalWeightKg = boxCount * boxConfig.unitWeightKg;
  const numDeliveries = Math.max(1, deliveryPoints.length);

  // Each delivery stop unloads a proportional share of the boxes
  const boxesPerStop = Math.floor(boxCount / numDeliveries);
  const remainderBoxes = boxCount % numDeliveries;

  const legs: RouteLeg[] = [];
  let currentLegIndex = 0;

  // Leg 0: Central Depot -> Pickup Point (Deadhead / Empty drive to load cargo)
  const distToPickup = calculateDistanceKm(depotCoords, pickupPoint.coords);
  legs.push({
    legIndex: currentLegIndex++,
    fromName: 'Central Depot Hub',
    fromPointId: 'depot',
    fromCoords: { ...depotCoords },
    toName: `${pickupPoint.code}: ${pickupPoint.name}`,
    toPointId: pickupPoint.id,
    toCoords: { ...pickupPoint.coords },
    distanceKm: distToPickup,
    cargoWeightKg: 0,
    boxCount: 0,
    boxTypeName: boxConfig.name,
    actionDescription: `Reposition to ${pickupPoint.code} to load ${boxCount} ${boxConfig.name} (${totalWeightKg.toLocaleString()} kg)`,
    completed: false
  });

  // Leg 1: Pickup Point -> Delivery Point 1 (Carrying FULL cargo)
  let remainingBoxes = boxCount;
  let prevPointCoords = pickupPoint.coords;
  let prevPointName = `${pickupPoint.code}: ${pickupPoint.name}`;
  let prevPointId: number | 'depot' = pickupPoint.id;

  deliveryPoints.forEach((dp, idx) => {
    const isFirstDelivery = idx === 0;
    const isLastDelivery = idx === deliveryPoints.length - 1;
    const currentCargoWeight = remainingBoxes * boxConfig.unitWeightKg;
    const dist = calculateDistanceKm(prevPointCoords, dp.coords);

    // Boxes to drop at this stop
    const unloadBoxes = isLastDelivery
      ? remainingBoxes
      : boxesPerStop + (idx === 0 ? remainderBoxes : 0);

    legs.push({
      legIndex: currentLegIndex++,
      fromName: prevPointName,
      fromPointId: prevPointId,
      fromCoords: { ...prevPointCoords },
      toName: `${dp.code}: ${dp.name}`,
      toPointId: dp.id,
      toCoords: { ...dp.coords },
      distanceKm: dist,
      cargoWeightKg: currentCargoWeight,
      boxCount: remainingBoxes,
      boxTypeName: boxConfig.name,
      actionDescription: `Carry ${remainingBoxes} boxes (${currentCargoWeight.toLocaleString()} kg) to ${dp.code}; unload ${unloadBoxes} boxes`,
      completed: false
    });

    remainingBoxes -= unloadBoxes;
    prevPointCoords = dp.coords;
    prevPointName = `${dp.code}: ${dp.name}`;
    prevPointId = dp.id;
  });

  // Final Leg: Last Delivery Point -> Central Depot Return (All cargo delivered, empty truck returns to depot)
  const lastDeliveryCoords = prevPointCoords;
  const distToDepot = calculateDistanceKm(lastDeliveryCoords, depotCoords);

  legs.push({
    legIndex: currentLegIndex++,
    fromName: prevPointName,
    fromPointId: prevPointId,
    fromCoords: { ...lastDeliveryCoords },
    toName: 'Central Depot & Fast Charging Hub',
    toPointId: 'depot',
    toCoords: { ...depotCoords },
    distanceKm: distToDepot,
    cargoWeightKg: 0,
    boxCount: 0,
    boxTypeName: boxConfig.name,
    actionDescription: 'Return to Central Depot for battery recharge (Empty Tare: 0 kg)',
    completed: false
  });

  const totalDistanceKm = Number(
    legs.reduce((sum, leg) => sum + leg.distanceKm, 0).toFixed(1)
  );

  return {
    legs,
    totalDistanceKm,
    totalInitialWeightKg: totalWeightKg,
    totalBoxes: boxCount
  };
}
