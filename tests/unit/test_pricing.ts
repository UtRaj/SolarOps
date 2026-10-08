/**
 * Unit Tests for Solar Physics & Freight Tariff Algorithms (Phase 12)
 */

export function calculateTestSolarOutput(simHours: number, baseCapacityKw: number, scaleMultiplier: number): number {
  if (simHours < 7.0 || simHours > 17.0) return 0.0;
  const hourOffset = Math.abs(simHours - 12.0);
  const sunElevation = Math.cos((hourOffset / 5.0) * (Math.PI / 2.0));
  return Math.round(baseCapacityKw * scaleMultiplier * Math.max(0, sunElevation) * 10) / 10;
}

export function calculateFreightTariff(
  distanceKm: number,
  weightKg: number,
  serviceMultiplier: number = 1.0,
  extraServicesSum: number = 0.0
): { subtotal: number; gst: number; total: number } {
  const perKmRate = 24.0 * serviceMultiplier;
  const perKgRate = 4.50;
  const baseDistanceFare = distanceKm * perKmRate;
  const weightFare = weightKg * perKgRate;
  const subtotal = Math.round((baseDistanceFare + weightFare + extraServicesSum) * 100) / 100;
  const gst = Math.round(((subtotal * 18.0) / 100.0) * 100) / 100;
  const total = Math.round((subtotal + gst) * 100) / 100;
  return { subtotal, gst, total };
}

// Simple test runner assertion
export function runTests(): { passed: number; failed: number; results: string[] } {
  const results: string[] = [];
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      passed++;
      results.push(`✓ [PASS] ${testName}`);
    } else {
      failed++;
      results.push(`✗ [FAIL] ${testName}`);
    }
  }

  // Test 1: Solar is 0 at midnight
  assert(calculateTestSolarOutput(0.0, 600, 1.0) === 0.0, 'Nighttime solar output is 0 kW at 00:00');

  // Test 2: Solar peaks at noon
  const noonSolar = calculateTestSolarOutput(12.0, 600, 1.0);
  assert(noonSolar === 600.0, `Noon solar reaches peak rated capacity (expected 600, got ${noonSolar})`);

  // Test 3: Freight calculation with 18% GST
  const quote = calculateFreightTariff(10.0, 100.0, 1.0, 0.0);
  // 10km * 24 = 240, 100kg * 4.5 = 450. Subtotal = 690. GST 18% = 124.2. Total = 814.2
  assert(quote.subtotal === 690.0, `Freight subtotal calculated accurately (${quote.subtotal})`);
  assert(quote.gst === 124.2, `18% GST matches statutory Indian GST formula (${quote.gst})`);
  assert(quote.total === 814.2, `Total invoice amount calculated accurately (${quote.total})`);

  return { passed, failed, results };
}
