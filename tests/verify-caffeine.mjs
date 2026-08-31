import { createRequire } from "module";
const require = createRequire(import.meta.url);
const model = require("../caffeine-model.js");

let passed = 0;
let failed = 0;

function check(label, actual, expected, tolerance) {
  let ok = false;
  if (typeof tolerance === "number") {
    ok = typeof actual === "number" && Math.abs(actual - expected) <= tolerance;
  } else if (typeof expected === "function") {
    ok = Boolean(expected(actual));
  } else {
    ok = Object.is(actual, expected);
  }
  if (ok) {
    passed++;
    console.log("  PASS  " + label);
  } else {
    failed++;
    console.log("  FAIL  " + label);
    console.log("        expected:", expected);
    console.log("        actual:  ", actual);
  }
}

function h(hours) { return hours * 3600000; }
function localTs(y, m, d, hh = 0, mm = 0) { return new Date(y, m - 1, d, hh, mm, 0, 0).getTime(); }

console.log("\nCore exponential model");
check("200mg at t=0 → 200mg", model.calculateRemaining(200, 0, 0, 5), 200);
check("200mg after 5h → 100mg", model.calculateRemaining(200, 0, h(5), 5), 100, 1e-12);
check("200mg after 10h → 50mg", model.calculateRemaining(200, 0, h(10), 5), 50, 1e-12);
check("200mg after 15h → 25mg", model.calculateRemaining(200, 0, h(15), 5), 25, 1e-12);
check("fractional half-life", model.calculateRemaining(200, 0, h(2.5), 5), 141.4213562373095, 1e-10);
check("seconds affect result", model.calculateRemaining(200, 0, 1000, 5), 200 * Math.pow(0.5, (1 / 3600) / 5), 1e-12);
check("zero dose accepted", model.calculateRemaining(0, 0, h(5), 5), 0);
check("future dose contributes zero", model.calculateRemaining(200, h(1), 0, 5), 0);
check("exact intake timestamp contributes full dose", model.calculateRemaining(200, h(1), h(1), 5), 200);

console.log("\nMultiple doses / superposition");
const entries = [
  { doseMg: 200, intakeTimestamp: h(0) },
  { doseMg: 150, intakeTimestamp: h(2) }
];
const expectedAt5 = 200 * Math.pow(0.5, 5 / 5) + 150 * Math.pow(0.5, 3 / 5);
check("different doses sum independently", model.calculateTotalRemaining(entries, h(5), 5), expectedAt5, 1e-12);
check("two simultaneous 200mg doses equal 400mg dose",
  model.calculateTotalRemaining([{doseMg:200,intakeTimestamp:0},{doseMg:200,intakeTimestamp:0}], h(5), 5),
  model.calculateRemaining(400, 0, h(5), 5), 1e-12);
check("split 200mg equals unsplit 200mg",
  model.calculateTotalRemaining([{doseMg:100,intakeTimestamp:0},{doseMg:100,intakeTimestamp:0}], h(3), 5),
  model.calculateRemaining(200, 0, h(3), 5), 1e-12);
check("future event excluded from mixed history",
  model.calculateTotalRemaining([{doseMg:100,intakeTimestamp:0},{doseMg:100,intakeTimestamp:h(10)}], h(2), 5),
  model.calculateRemaining(100, 0, h(2), 5), 1e-12);

console.log("\nSensitivity trajectories");
const sensitivity = model.calculateSensitivity([{doseMg:200,intakeTimestamp:0}], h(8), 5);
check("3h sensitivity ≈ 31.498mg", sensitivity.fast, 31.49802624737183, 1e-10);
check("5h nominal ≈ 65.975mg", sensitivity.selected, 65.97539553864472, 1e-10);
check("8h sensitivity = 100mg", sensitivity.slow, 100, 1e-12);
check("reference low is fast trajectory", sensitivity.referenceLow, sensitivity.fast, 1e-12);
check("reference high is slow trajectory", sensitivity.referenceHigh, sensitivity.slow, 1e-12);
const customSensitivity = model.calculateSensitivity([{doseMg:200,intakeTimestamp:0}], h(8), 10);
check("custom selected half-life can sit outside 3–8h reference", customSensitivity.selected > customSensitivity.referenceHigh, true);

console.log("\nValidation");
for (const invalid of [0, -1, NaN, Infinity, -Infinity, "5", null, undefined]) {
  check("invalid half-life rejected: " + String(invalid), model.validateHalfLife(invalid), false);
}
check("5h valid", model.validateHalfLife(5), true);
check("31h custom valid", model.validateHalfLife(31), true);
check("negative dose invalid", model.validateDose(-1), false);
check("NaN dose invalid", model.validateDose(NaN), false);
check("Infinity dose invalid", model.validateDose(Infinity), false);
check("5000mg valid bound", model.validateDose(5000), true);
check("5000.1mg invalid bound", model.validateDose(5000.1), false);
check("invalid entries array returns null", model.calculateTotalRemaining(null, 0, 5), null);
check("invalid entry returns null", model.calculateTotalRemaining([{doseMg:6000,intakeTimestamp:0}], 0, 5), null);
check("invalid timestamp returns null", model.calculateRemaining(200, NaN, 0, 5), null);

console.log("\nDaily totals");
process.env.TZ = "Asia/Singapore";
let now = localTs(2026, 8, 31, 12, 0);
let daily = [
  { doseMg: 100, intakeTimestamp: localTs(2026, 8, 30, 23, 0) },
  { doseMg: 200, intakeTimestamp: localTs(2026, 8, 31, 8, 0) },
  { doseMg: 150, intakeTimestamp: localTs(2026, 8, 31, 10, 0) },
  { doseMg: 75, intakeTimestamp: localTs(2026, 8, 31, 14, 0) }
];
check("daily consumed excludes yesterday and same-day future", model.calculateDailyConsumed(daily, now), 350);
check("daily entry count excludes same-day future", model.calculateDailyEntryCount(daily, now), 2);
check("daily consumed later includes scheduled dose once reached", model.calculateDailyConsumed(daily, localTs(2026,8,31,15,0)), 425);
check("cross-midnight elapsed remains exact", model.calculateRemaining(200, localTs(2026,8,30,23,0), localTs(2026,8,31,1,0), 5), 200 * Math.pow(0.5, 2/5), 1e-10);

console.log("\nDST-safe local calendar boundaries");
process.env.TZ = "America/New_York";
const springNoon = localTs(2026, 3, 8, 12, 0);
const springBounds = model.getLocalDayBounds(springNoon);
check("spring-forward local day is 23 elapsed hours", (springBounds.end - springBounds.start) / 3600000, 23);
const fallNoon = localTs(2026, 11, 1, 12, 0);
const fallBounds = model.getLocalDayBounds(fallNoon);
check("fall-back local day is 25 elapsed hours", (fallBounds.end - fallBounds.start) / 3600000, 25);
const lateSpring = localTs(2026, 3, 8, 23, 30);
check("late spring-forward-day dose remains on same local date", model.calculateDailyConsumed([{doseMg:100,intakeTimestamp:lateSpring}], localTs(2026,3,8,23,45)), 100);

console.log("\nProjection and chart data");
process.env.TZ = "Asia/Singapore";
const series = model.generateProjectionSeries([{doseMg:200,intakeTimestamp:0}], 0, 5, [0,5,10]);
check("projection length", series.length, 3);
check("projection now", series[0].remaining, 200, 1e-12);
check("projection +5h", series[1].remaining, 100, 1e-12);
check("projection +10h", series[2].remaining, 50, 1e-12);
check("projection carries 3h reference", series[1].fast, 200 * Math.pow(0.5,5/3), 1e-12);
check("projection carries 8h reference", series[1].slow, 200 * Math.pow(0.5,5/8), 1e-12);
const chart = model.generateChartData([{doseMg:200,intakeTimestamp:0}], 0, h(10), 5, 10);
check("chart has pointCount + 1 samples", chart.length, 11);
check("chart first point exact", chart[0].remaining, 200, 1e-12);
check("chart last point exact", chart[10].remaining, 50, 1e-12);
check("bad chart interval rejected", model.generateChartData([], 10, 5, 5, 10), null);

console.log("\nFormatting");
check("0ms elapsed", model.formatElapsed(0), "0m");
check("30min elapsed", model.formatElapsed(30 * 60000), "30m");
check("90min elapsed", model.formatElapsed(90 * 60000), "1h 30m");
check("future elapsed", model.formatElapsed(-1), "not yet");
check("invalid elapsed", model.formatElapsed(NaN), "—");

console.log("\n" + "─".repeat(58));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log("ALL UNIT TESTS PASSED");
