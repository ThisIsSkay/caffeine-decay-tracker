/**
 * Automated tests for the caffeine decay calculation engine.
 *
 * Runs with plain Node.js: node tests/verify-caffeine.mjs
 * No test framework required.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const model = require("../caffeine-model.js");

const {
  validateHalfLife,
  validateDose,
  calculateRemaining,
  calculateTotalRemaining,
  calculateProjection,
  calculateDailyConsumed,
  generateProjectionSeries,
  formatElapsed,
  HALF_LIFE_MIN,
  HALF_LIFE_MAX,
  DOSE_MAX
} = model;

let passed = 0;
let failed = 0;

function check(label, actual, expected, tolerance) {
  if (tolerance !== undefined) {
    if (typeof actual === "number" && typeof expected === "number" &&
        Math.abs(actual - expected) <= tolerance) {
      passed++;
      console.log(`  PASS  ${label}`);
      return;
    }
  } else if (typeof expected === "function") {
    if (expected(actual)) {
      passed++;
      console.log(`  PASS  ${label}`);
      return;
    }
  } else if (actual === expected) {
    passed++;
    console.log(`  PASS  ${label}`);
    return;
  }
  failed++;
  console.log(`  FAIL  ${label}`);
  console.log(`        expected: ${JSON.stringify(expected)}`);
  console.log(`        actual:   ${JSON.stringify(actual)}`);
}

// Helper: timestamp for a given hour:minute on a fixed date
function tsAt(hours, minutes, dayOffset) {
  var d = new Date(2026, 7, 31, hours, minutes, 0, 0); // Aug 31 2026
  if (dayOffset) d.setDate(d.getDate() + dayOffset);
  return d.getTime();
}

function msHours(h) {
  return h * 60 * 60 * 1000;
}

// ── Test 1: Zero elapsed ────────────────────────────────────────
console.log("\nTest 1: Zero elapsed time");
check("200mg at t=0 → 200mg",
  calculateRemaining(200, 1000, 1000, 5), 200);

// ── Test 2: One half-life ───────────────────────────────────────
console.log("\nTest 2: One half-life elapsed");
{
  let t0 = 0;
  let t1 = msHours(5);
  check("200mg after 5h (hl=5) → 100mg",
    calculateRemaining(200, t0, t1, 5), 100, 1e-10);
}

// ── Test 3: Two half-lives ──────────────────────────────────────
console.log("\nTest 3: Two half-lives elapsed");
{
  let t0 = 0;
  let t1 = msHours(10);
  check("200mg after 10h (hl=5) → 50mg",
    calculateRemaining(200, t0, t1, 5), 50, 1e-10);
}

// ── Test 4: Three half-lives ────────────────────────────────────
console.log("\nTest 4: Three half-lives elapsed");
{
  let t0 = 0;
  let t1 = msHours(15);
  check("200mg after 15h (hl=5) → 25mg",
    calculateRemaining(200, t0, t1, 5), 25, 1e-10);
}

// ── Test 5: Fractional half-life ────────────────────────────────
console.log("\nTest 5: Fractional half-life (half a half-life)");
{
  let t0 = 0;
  let t1 = msHours(2.5);
  // 200 × 0.5^(2.5/5) = 200 × 0.5^0.5 = 200 × 0.70710678… ≈ 141.421356…
  let expected = 200 * Math.pow(0.5, 0.5);
  check("200mg after 2.5h (hl=5) → ~141.4214mg",
    calculateRemaining(200, t0, t1, 5), expected, 1e-6);
  check("≈ 141.421356",
    calculateRemaining(200, t0, t1, 5), 141.421356, 0.001);
}

// ── Test 6: Two identical doses at same time ────────────────────
console.log("\nTest 6: Two identical doses at same time");
{
  let t0 = 0;
  let t1 = msHours(5);
  let entries = [
    { doseMg: 200, intakeTimestamp: t0 },
    { doseMg: 200, intakeTimestamp: t0 }
  ];
  // Each: 200 × 0.5^1 = 100, total = 200
  check("2×200mg after 1 half-life → 200mg",
    calculateTotalRemaining(entries, t1, 5), 200, 1e-10);
}

// ── Test 7: Different intake times ──────────────────────────────
console.log("\nTest 7: Different intake times");
{
  let t_08 = tsAt(8, 0);
  let t_10 = tsAt(10, 0);
  let t_13 = tsAt(13, 0);
  let entries = [
    { doseMg: 200, intakeTimestamp: t_08 },
    { doseMg: 150, intakeTimestamp: t_10 }
  ];
  // Dose A: 200 × 0.5^(5/5) = 200 × 0.5 = 100
  // Dose B: 150 × 0.5^(3/5) = 150 × 0.5^0.6 = 150 × 0.65975… ≈ 98.963…
  let expectedA = 200 * Math.pow(0.5, 5 / 5);
  let expectedB = 150 * Math.pow(0.5, 3 / 5);
  let expectedTotal = expectedA + expectedB;

  check("Dose A remaining (200mg, 5h elapsed)",
    calculateRemaining(200, t_08, t_13, 5), expectedA, 1e-10);
  check("Dose B remaining (150mg, 3h elapsed)",
    calculateRemaining(150, t_10, t_13, 5), expectedB, 1e-10);
  check("Total remaining ≈ 198.963mg",
    calculateTotalRemaining(entries, t_13, 5), expectedTotal, 1e-10);

  // Hard-coded verification: 100 + 98.96349… = 198.96349…
  check("Hard-coded total ≈ 198.963",
    calculateTotalRemaining(entries, t_13, 5), 198.963, 0.001);
}

// ── Test 8: Future entry contributes 0 ──────────────────────────
console.log("\nTest 8: Future entry contributes 0mg");
{
  let t_10 = tsAt(10, 0);
  let t_11 = tsAt(11, 0);
  check("200mg scheduled at 11:00, current 10:00 → 0mg",
    calculateRemaining(200, t_11, t_10, 5), 0);
}

// ── Test 9: Exactly at future intake timestamp ──────────────────
console.log("\nTest 9: Exactly at intake timestamp");
{
  let t_11 = tsAt(11, 0);
  check("200mg at 11:00, current 11:00 → 200mg",
    calculateRemaining(200, t_11, t_11, 5), 200);
}

// ── Test 10: Invalid half-life ──────────────────────────────────
console.log("\nTest 10: Invalid half-life values");
check("half-life 0 → invalid", validateHalfLife(0), false);
check("half-life -3 → invalid", validateHalfLife(-3), false);
check("half-life NaN → invalid", validateHalfLife(NaN), false);
check("half-life Infinity → invalid", validateHalfLife(Infinity), false);
check("half-life 'five' → invalid", validateHalfLife("five"), false);
check("half-life null → invalid", validateHalfLife(null), false);
check("half-life undefined → invalid", validateHalfLife(undefined), false);

check("calculateRemaining with hl=0 → null",
  calculateRemaining(200, 0, msHours(1), 0), null);
check("calculateRemaining with hl=-1 → null",
  calculateRemaining(200, 0, msHours(1), -1), null);
check("calculateRemaining with hl=NaN → null",
  calculateRemaining(200, 0, msHours(1), NaN), null);
check("calculateRemaining with hl=Infinity → null",
  calculateRemaining(200, 0, msHours(1), Infinity), null);

// ── Test 11: Invalid dose ───────────────────────────────────────
console.log("\nTest 11: Invalid dose values");
check("dose -100 → invalid", validateDose(-100), false);
check("dose NaN → invalid", validateDose(NaN), false);
check("dose Infinity → invalid", validateDose(Infinity), false);
check("dose 'abc' → invalid", validateDose("abc"), false);

// Zero dose is accepted as valid (contributes 0mg)
check("dose 0 → valid (zero intake)", validateDose(0), true);
check("calculateRemaining with dose=0 → 0",
  calculateRemaining(0, 0, msHours(5), 5), 0);

check("calculateRemaining with dose=-100 → null",
  calculateRemaining(-100, 0, msHours(1), 5), null);
check("calculateRemaining with dose=NaN → null",
  calculateRemaining(NaN, 0, msHours(1), 5), null);

// ── Test 12: Cross midnight ─────────────────────────────────────
console.log("\nTest 12: Cross midnight");
{
  let t_23 = tsAt(23, 0, -1); // 23:00 yesterday
  let t_01 = tsAt(1, 0);       // 01:00 today

  let elapsedMs = t_01 - t_23;
  let elapsedHours = elapsedMs / (1000 * 60 * 60);
  check("23:00 yesterday to 01:00 today = 2 hours",
    elapsedHours, 2, 1e-10);

  // 200 × 0.5^(2/5)
  let expected = 200 * Math.pow(0.5, 2 / 5);
  check("200mg across midnight, 2h elapsed → ~151.57mg",
    calculateRemaining(200, t_23, t_01, 5), expected, 1e-10);
  check("Hard-coded ≈ 151.572",
    calculateRemaining(200, t_23, t_01, 5), 151.572, 0.001);
}

// ── Test 13: Fractional minutes ─────────────────────────────────
console.log("\nTest 13: Fractional minutes/seconds precision");
{
  let t0 = 0;
  // 1 hour 23 minutes 45 seconds = 1.39583… hours
  let t1 = (1 * 3600 + 23 * 60 + 45) * 1000;
  let elapsedHours = t1 / (1000 * 3600);
  let expected = 200 * Math.pow(0.5, elapsedHours / 5);
  check("200mg after 1h23m45s (hl=5) — fractional precision",
    calculateRemaining(200, t0, t1, 5), expected, 1e-10);
}

// ── Test 14: Multiple doses with future entry ───────────────────
console.log("\nTest 14: Multiple doses including future entry");
{
  let t_08 = tsAt(8, 0);
  let t_10 = tsAt(10, 0);
  let t_14 = tsAt(14, 0); // future
  let t_now = tsAt(12, 0);

  let entries = [
    { doseMg: 200, intakeTimestamp: t_08 },
    { doseMg: 150, intakeTimestamp: t_10 },
    { doseMg: 200, intakeTimestamp: t_14 } // future: contributes 0
  ];

  let expectedA = 200 * Math.pow(0.5, 4 / 5); // 4h elapsed
  let expectedB = 150 * Math.pow(0.5, 2 / 5); // 2h elapsed
  let expectedC = 0; // future
  let expectedTotal = expectedA + expectedB + expectedC;

  check("Future dose excluded from total",
    calculateTotalRemaining(entries, t_now, 5), expectedTotal, 1e-10);
}

// ── Test 15: Projection includes future intake ──────────────────
console.log("\nTest 15: Projection after future intake time includes it");
{
  let t_08 = tsAt(8, 0);
  let t_14 = tsAt(14, 0);
  let t_now = tsAt(10, 0);

  let entries = [
    { doseMg: 200, intakeTimestamp: t_08 },
    { doseMg: 150, intakeTimestamp: t_14 }
  ];

  // At +6h (t=16:00): dose A elapsed=8h, dose B elapsed=2h
  let t_16 = tsAt(16, 0);
  let expectedA = 200 * Math.pow(0.5, 8 / 5);
  let expectedB = 150 * Math.pow(0.5, 2 / 5);
  check("Projection at 16:00 includes 14:00 dose",
    calculateProjection(entries, t_16, 5), expectedA + expectedB, 1e-10);

  // At +2h (t=12:00): dose A elapsed=4h, dose B still future
  let t_12 = tsAt(12, 0);
  let expectedA2 = 200 * Math.pow(0.5, 4 / 5);
  check("Projection at 12:00 excludes future 14:00 dose",
    calculateProjection(entries, t_12, 5), expectedA2, 1e-10);
}

// ── Test 16: Daily consumed ─────────────────────────────────────
console.log("\nTest 16: Daily consumed total");
{
  let t_yesterday = tsAt(22, 0, -1);
  let t_morning = tsAt(8, 0);
  let t_afternoon = tsAt(14, 0);
  let t_now = tsAt(16, 0);

  let entries = [
    { doseMg: 100, intakeTimestamp: t_yesterday },
    { doseMg: 200, intakeTimestamp: t_morning },
    { doseMg: 150, intakeTimestamp: t_afternoon }
  ];

  check("Daily consumed excludes yesterday",
    calculateDailyConsumed(entries, t_now), 350);
}

// ── Test 17: Empty entries ──────────────────────────────────────
console.log("\nTest 17: Empty entries");
check("No entries → 0mg remaining",
  calculateTotalRemaining([], tsAt(12, 0), 5), 0);
check("No entries → daily consumed 0",
  calculateDailyConsumed([], tsAt(12, 0)), 0);

// ── Test 18: Various half-life values ───────────────────────────
console.log("\nTest 18: Various half-life values");
{
  let t0 = 0;
  let t1 = msHours(3);

  // half-life 3h: 200 × 0.5^(3/3) = 100
  check("hl=3, 3h elapsed → 100mg",
    calculateRemaining(200, t0, t1, 3), 100, 1e-10);

  // half-life 6h: 200 × 0.5^(3/6) = 200 × 0.5^0.5 ≈ 141.42
  let expected6 = 200 * Math.pow(0.5, 0.5);
  check("hl=6, 3h elapsed → ~141.42mg",
    calculateRemaining(200, t0, t1, 6), expected6, 1e-10);

  // half-life 1h: 200 × 0.5^(3/1) = 200 × 0.125 = 25
  check("hl=1, 3h elapsed → 25mg",
    calculateRemaining(200, t0, t1, 1), 25, 1e-10);
}

// ── Test 19: Validation bounds ──────────────────────────────────
console.log("\nTest 19: Validation bounds");
check("half-life 0.5 (min) → valid", validateHalfLife(HALF_LIFE_MIN), true);
check("half-life 24 (max) → valid", validateHalfLife(HALF_LIFE_MAX), true);
check("half-life 0.49 → invalid", validateHalfLife(0.49), false);
check("half-life 24.1 → invalid", validateHalfLife(24.1), false);
check("dose 5000 (max) → valid", validateDose(DOSE_MAX), true);
check("dose 5001 → invalid", validateDose(5001), false);

// ── Test 20: formatElapsed ──────────────────────────────────────
console.log("\nTest 20: formatElapsed");
check("0ms → '0m'", formatElapsed(0), "0m");
check("30min → '30m'", formatElapsed(30 * 60000), "30m");
check("90min → '1h 30m'", formatElapsed(90 * 60000), "1h 30m");
check("negative → 'not yet'", formatElapsed(-1000), "not yet");

// ── Test 21: Invalid entries array ──────────────────────────────
console.log("\nTest 21: Invalid entries");
check("null entries → null", calculateTotalRemaining(null, 1000, 5), null);
check("string entries → null", calculateTotalRemaining("bad", 1000, 5), null);

// ── Test 22: Projection series ──────────────────────────────────
console.log("\nTest 22: Projection series");
{
  let t_08 = tsAt(8, 0);
  let entries = [{ doseMg: 200, intakeTimestamp: t_08 }];
  let t_now = tsAt(8, 0);
  let series = generateProjectionSeries(entries, t_now, 5, [0, 5, 10]);

  check("Series length = 3", series.length, 3);
  check("Series[0] = 200mg (now)", series[0].remaining, 200, 1e-10);
  check("Series[1] = 100mg (+5h)", series[1].remaining, 100, 1e-10);
  check("Series[2] = 50mg (+10h)", series[2].remaining, 50, 1e-10);
}

// ── Test 23: Invalid timestamps ─────────────────────────────────
console.log("\nTest 23: Invalid timestamps");
check("null intakeTimestamp → null",
  calculateRemaining(200, null, 1000, 5), null);
check("undefined nowTimestamp → null",
  calculateRemaining(200, 0, undefined, 5), null);
check("NaN timestamps → null",
  calculateRemaining(200, NaN, 1000, 5), null);

// ── Summary ─────────────────────────────────────────────────────
console.log("\n" + "─".repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("ALL TESTS PASSED");
}
