import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autoAssignTruckForOrder,
  calculateEarlyDispatchTime,
  calculateMultiStopPricing,
  calculateOrderPricing,
  generateMultiStopOrderRoute,
  getServiceTariffMultiplier,
} from '../../src/utils/pricingEngine';
import {
  calculateDistanceKm,
  calculateFarmOutput,
  calculateLegEnergyConsumption,
  calculateSunElevation,
  clamp,
  formatTime,
  isNightTime,
} from '../../src/utils/solarPhysics';
import { DEPOT_COORDS, INITIAL_DELIVERY_POINTS, INITIAL_SOLAR_FARMS, INITIAL_TRUCKS, INITIAL_WEATHER } from '../../src/data/initialState';

test('solar geometry handles day, night, and the daily peak', () => {
  assert.equal(calculateSunElevation(0), 0);
  assert.equal(calculateSunElevation(12.125), 1);
  assert.ok(calculateSunElevation(9) > 0);
  assert.equal(calculateSunElevation(24), calculateSunElevation(0));
});

test('farm output is zero at night and remains nonnegative in low light', () => {
  const farm = INITIAL_SOLAR_FARMS[0];
  assert.equal(calculateFarmOutput(farm, 2, INITIAL_WEATHER), 0);
  assert.ok(calculateFarmOutput(farm, 12, INITIAL_WEATHER) > 0);
  assert.ok(calculateFarmOutput(farm, 6, INITIAL_WEATHER) >= 0);
});

test('clamp, clock formatting, and night boundary normalize out-of-range hours', () => {
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(formatTime(25.5), '01:30');
  assert.equal(formatTime(-0.5), '23:30');
  assert.equal(isNightTime(17), true);
  assert.equal(isNightTime(7), false);
  assert.equal(isNightTime(24), true);
});

test('city distance uses configured minimum and returns rounded distance', () => {
  assert.equal(calculateDistanceKm({ x: 0, y: 0 }, { x: 0, y: 0 }), 1.5);
  assert.equal(calculateDistanceKm({ x: 0, y: 0 }, { x: 3, y: 4 }), 1.8);
});

test('loaded cargo increases EV leg energy consumption', () => {
  assert.deepEqual(calculateLegEnergyConsumption(10, 0), { kwh: 8.2, ratePerKm: 0.82 });
  assert.deepEqual(calculateLegEnergyConsumption(10, 2500), { kwh: 12.2, ratePerKm: 1.22 });
});

test('service tariffs retain standard and specialized rates, including legacy aliases', () => {
  assert.equal(getServiceTariffMultiplier('standard-dry-van'), 1);
  assert.equal(getServiceTariffMultiplier('cold-chain'), 1.25);
  assert.equal(getServiceTariffMultiplier('heavy-haul'), 1.2);
  assert.equal(getServiceTariffMultiplier('fragile-secure'), 1.22);
  assert.equal(getServiceTariffMultiplier('express-rapid'), 1.18);
});

test('multi-stop pricing breaks out each leg, cargo, surcharge, and GST', () => {
  const [originTemplate] = INITIAL_DELIVERY_POINTS;
  const origin = { ...originTemplate, coords: { x: 0, y: 0 } };
  const first = { ...originTemplate, id: 90, coords: { x: 3, y: 4 } };
  const second = { ...originTemplate, id: 91, coords: { x: 3, y: 4 } };
  const quote = calculateMultiStopPricing(origin, [
    { deliveryPoint: first, cargoWeightKg: 10, boxCount: 1 },
    { deliveryPoint: second, cargoWeightKg: 20, boxCount: 2 },
  ], 'standard', ['hydraulic_liftgate']);

  assert.equal(quote.stopBreakdown?.length, 2);
  assert.deepEqual(quote.stopBreakdown?.map((stop) => stop.legDistanceKm), [1.8, 1.5]);
  assert.equal(quote.distanceKm, 3.3);
  assert.equal(quote.baseDistanceFare, 79.2);
  assert.equal(quote.weightFare, 135);
  assert.equal(quote.extraServicesFare, 850);
  assert.equal(quote.subtotal, 1064.2);
  assert.equal(quote.gstAmount, 191.56);
  assert.equal(quote.totalAmount, 1255.76);
});

test('legacy one-destination quote wrapper uses the same pricing rules', () => {
  const [origin, destination] = INITIAL_DELIVERY_POINTS;
  const quote = calculateOrderPricing(origin, destination, 100, 'cold-chain');
  assert.equal(quote.perKmRate, 30);
  assert.equal(quote.stopBreakdown?.length, 1);
  assert.equal(quote.gstRatePct, 18);
});

test('empty multi-stop quote is zero-valued and contains no stop breakdown', () => {
  const quote = calculateMultiStopPricing(INITIAL_DELIVERY_POINTS[0], [], 'standard');
  assert.equal(quote.distanceKm, 0);
  assert.equal(quote.totalAmount, 0);
  assert.deepEqual(quote.stopBreakdown, []);
});

test('truck assignment honors specialization, capacity, availability, and SoC ranking', () => {
  const standard = autoAssignTruckForOrder(INITIAL_TRUCKS, 'standard-dry-van', 1000);
  assert.ok(standard);
  assert.equal(standard.specialization.serviceType, 'standard-dry-van');
  assert.equal(standard.opStatus, 'Available at Depot');
  assert.equal(autoAssignTruckForOrder(INITIAL_TRUCKS, 'heavy-duty-flatbed', 5000), null);
  assert.equal(autoAssignTruckForOrder(INITIAL_TRUCKS, 'refrigerated-cryo', 1000)?.specialization.serviceType, 'refrigerated-cryo');
});

test('early dispatch applies a minimum buffer and wraps before midnight', () => {
  const colocated = calculateEarlyDispatchTime(DEPOT_COORDS, 8);
  assert.equal(colocated.transitMinutesFromBay, 5);
  assert.equal(colocated.calculatedDispatchTimeHours, 7.92);

  const overnight = calculateEarlyDispatchTime({ x: 100, y: 100 }, 0.01);
  assert.ok(overnight.calculatedDispatchTimeHours >= 0 && overnight.calculatedDispatchTimeHours < 24);
});

test('multi-stop route contains pickup, delivery legs, and an empty depot return', () => {
  const [originTemplate] = INITIAL_DELIVERY_POINTS;
  const origin = { ...originTemplate, coords: { ...DEPOT_COORDS } };
  const first = { ...originTemplate, id: 90, coords: { x: 60, y: 55 } };
  const second = { ...originTemplate, id: 91, coords: { x: 70, y: 55 } };
  const route = generateMultiStopOrderRoute(DEPOT_COORDS, origin, [
    { deliveryPoint: first, cargoWeightKg: 80, boxCount: 4 },
    { deliveryPoint: second, cargoWeightKg: 20, boxCount: 1 },
  ], 'ORD-TEST');

  assert.equal(route.legs.length, 4);
  assert.equal(route.legs[0].boxTypeName, 'Tare Repositioning');
  assert.equal(route.legs[1].cargoWeightKg, 100);
  assert.equal(route.legs[2].cargoWeightKg, 20);
  assert.equal(route.legs[3].boxTypeName, 'Empty Return');
  assert.equal(route.legs[3].cargoWeightKg, 0);
  assert.ok(route.totalDistanceKm > 0);
});
