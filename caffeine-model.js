/* Caffeine decay calculation engine.
 *
 * Pure functions — no DOM, no side-effects, independently testable.
 *
 * Default amount-remaining model:
 *   one-compartment, first-order elimination
 *   remaining = dose × 0.5 ^ (elapsed_hours / half_life_hours)
 *
 * Each dose decays independently from its own intake timestamp.
 * Instantaneous absorption is intentionally used for the simple “mg remaining”
 * view. Biological uncertainty is represented separately with sensitivity
 * trajectories rather than hidden inside the deterministic formula.
 */

var DEFAULT_HALF_LIFE_HOURS = 5;
var SENSITIVITY_FAST_HOURS = 3;
var SENSITIVITY_SLOW_HOURS = 8;
var LITERATURE_HALF_LIFE_MIN_HOURS = 1.5;
var LITERATURE_HALF_LIFE_MAX_HOURS = 9.5;
var DOSE_MAX = 5000;
var DEFAULT_VD_L_PER_KG = 0.60;
var OBESITY_VD_L_PER_KG = 0.45;
var BODY_WEIGHT_MIN_KG = 20;
var BODY_WEIGHT_MAX_KG = 300;
// ECMAScript Date's TimeClip range is ±8.64e15 ms from the Unix epoch.
var MAX_DATE_TIMESTAMP = 8640000000000000;

var HALF_LIFE_PRESETS = [
  { id: "typical",    label: "Typical Healthy Adult",      halfLife: 5.0,  range: "2.7–9.9 h" },
  { id: "smoker",     label: "Current Cigarette Smoker",   halfLife: 3.5,  range: "2.3–3.7 h" },
  { id: "oc",         label: "Estrogen-Containing OC",     halfLife: 8.0,  range: "7.9–10.7 h" },
  { id: "pregnancy",  label: "Late Pregnancy",             halfLife: 10.5, range: "10.5–15.1 h" },
  { id: "older",      label: "Older Adult (65+)",          halfLife: 5.0,  range: "2.3–9.9 h" },
  { id: "cirrhosis",  label: "Compensated Cirrhosis",      halfLife: 4.0,  range: "1.1–8.4 h" },
  { id: "heavy",      label: "Heavy Habitual Use",         halfLife: 5.0,  range: "2.7–9.9 h" }
];

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function validateHalfLife(hours) {
  return isFiniteNumber(hours) && hours > 0;
}

function validateDose(mg) {
  return isFiniteNumber(mg) && mg >= 0 && mg <= DOSE_MAX;
}

function validateTimestamp(timestamp) {
  return isFiniteNumber(timestamp) && Math.abs(timestamp) <= MAX_DATE_TIMESTAMP;
}

function calculateRemaining(doseMg, intakeTimestamp, queryTimestamp, halfLifeHours) {
  if (!validateDose(doseMg)) return null;
  if (!validateHalfLife(halfLifeHours)) return null;
  if (!validateTimestamp(intakeTimestamp) || !validateTimestamp(queryTimestamp)) return null;

  if (doseMg === 0) return 0;

  var elapsedMs = queryTimestamp - intakeTimestamp;
  if (elapsedMs < 0) return 0;

  var elapsedHours = elapsedMs / 3600000;
  var remaining = doseMg * Math.pow(0.5, elapsedHours / halfLifeHours);
  return isFiniteNumber(remaining) && remaining >= 0 ? remaining : null;
}

function calculateTotalRemaining(entries, queryTimestamp, halfLifeHours) {
  if (!Array.isArray(entries)) return null;
  if (!validateTimestamp(queryTimestamp) || !validateHalfLife(halfLifeHours)) return null;

  var total = 0;
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry || typeof entry !== "object") return null;
    var remaining = calculateRemaining(
      entry.doseMg,
      entry.intakeTimestamp,
      queryTimestamp,
      halfLifeHours
    );
    if (remaining === null) return null;
    total += remaining;
    if (!isFiniteNumber(total) || total < 0) return null;
  }
  return total;
}

function calculateProjection(entries, queryTimestamp, halfLifeHours) {
  return calculateTotalRemaining(entries, queryTimestamp, halfLifeHours);
}

function calculateSensitivity(entries, queryTimestamp, selectedHalfLifeHours) {
  var selected = calculateTotalRemaining(entries, queryTimestamp, selectedHalfLifeHours);
  var fast = calculateTotalRemaining(entries, queryTimestamp, SENSITIVITY_FAST_HOURS);
  var slow = calculateTotalRemaining(entries, queryTimestamp, SENSITIVITY_SLOW_HOURS);
  if (selected === null || fast === null || slow === null) return null;

  return {
    selected: selected,
    fast: fast,
    slow: slow,
    referenceLow: Math.min(fast, slow),
    referenceHigh: Math.max(fast, slow),
    selectedHalfLifeHours: selectedHalfLifeHours,
    fastHalfLifeHours: SENSITIVITY_FAST_HOURS,
    slowHalfLifeHours: SENSITIVITY_SLOW_HOURS
  };
}

function getLocalDayBounds(referenceTimestamp) {
  if (!validateTimestamp(referenceTimestamp)) return null;
  var reference = new Date(referenceTimestamp);
  if (!Number.isFinite(reference.getTime())) return null;

  var start = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
    0, 0, 0, 0
  ).getTime();
  var end = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate() + 1,
    0, 0, 0, 0
  ).getTime();

  return { start: start, end: end };
}

function calculateDailyConsumed(entries, nowTimestamp) {
  if (!Array.isArray(entries) || !validateTimestamp(nowTimestamp)) return 0;
  var bounds = getLocalDayBounds(nowTimestamp);
  if (!bounds) return 0;

  var total = 0;
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry || !validateDose(entry.doseMg) || !validateTimestamp(entry.intakeTimestamp)) continue;
    if (entry.intakeTimestamp >= bounds.start &&
        entry.intakeTimestamp < bounds.end &&
        entry.intakeTimestamp <= nowTimestamp) {
      total += entry.doseMg;
    }
  }
  return total;
}

function calculateDailyEntryCount(entries, nowTimestamp) {
  if (!Array.isArray(entries) || !validateTimestamp(nowTimestamp)) return 0;
  var bounds = getLocalDayBounds(nowTimestamp);
  if (!bounds) return 0;

  var count = 0;
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry || !validateDose(entry.doseMg) || !validateTimestamp(entry.intakeTimestamp)) continue;
    if (entry.intakeTimestamp >= bounds.start &&
        entry.intakeTimestamp < bounds.end &&
        entry.intakeTimestamp <= nowTimestamp) {
      count++;
    }
  }
  return count;
}

function generateProjectionSeries(entries, nowTimestamp, halfLifeHours, steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    steps = [0, 2, 4, 6, 8, 10, 12];
  }
  if (!validateTimestamp(nowTimestamp) || !validateHalfLife(halfLifeHours)) return null;

  var series = [];
  for (var i = 0; i < steps.length; i++) {
    var offset = Number(steps[i]);
    if (!Number.isFinite(offset)) return null;
    var timestamp = nowTimestamp + offset * 3600000;
    if (!validateTimestamp(timestamp)) return null;
    var sensitivity = calculateSensitivity(entries, timestamp, halfLifeHours);
    if (!sensitivity) return null;
    series.push({
      offsetHours: offset,
      timestamp: timestamp,
      remaining: sensitivity.selected,
      fast: sensitivity.fast,
      slow: sensitivity.slow,
      referenceLow: sensitivity.referenceLow,
      referenceHigh: sensitivity.referenceHigh
    });
  }
  return series;
}

function generateChartData(entries, startTimestamp, endTimestamp, halfLifeHours, pointCount) {
  if (!validateTimestamp(startTimestamp) || !validateTimestamp(endTimestamp)) return null;
  if (!validateHalfLife(halfLifeHours) || endTimestamp <= startTimestamp) return null;
  if (!Number.isInteger(pointCount) || pointCount < 2) pointCount = 200;

  var step = (endTimestamp - startTimestamp) / pointCount;
  var points = [];
  for (var i = 0; i <= pointCount; i++) {
    var timestamp = startTimestamp + step * i;
    if (!validateTimestamp(timestamp)) return null;
    var sensitivity = calculateSensitivity(entries, timestamp, halfLifeHours);
    if (!sensitivity) return null;
    points.push({
      timestamp: timestamp,
      remaining: sensitivity.selected,
      fast: sensitivity.fast,
      slow: sensitivity.slow,
      referenceLow: sensitivity.referenceLow,
      referenceHigh: sensitivity.referenceHigh
    });
  }
  return points;
}

function validateBodyWeight(kg) {
  return isFiniteNumber(kg) && kg >= BODY_WEIGHT_MIN_KG && kg <= BODY_WEIGHT_MAX_KG;
}

function validateVd(vd) {
  return isFiniteNumber(vd) && vd > 0 && vd <= 2;
}

function calculateConcentration(remainingMg, bodyWeightKg, vdLPerKg) {
  if (!isFiniteNumber(remainingMg) || remainingMg < 0) return null;
  if (!validateBodyWeight(bodyWeightKg)) return null;
  if (!validateVd(vdLPerKg)) return null;

  var volumeL = bodyWeightKg * vdLPerKg;
  if (volumeL <= 0) return null;
  var concentration = remainingMg / volumeL;
  return isFiniteNumber(concentration) ? concentration : null;
}

function calculateTotalConcentration(entries, queryTimestamp, halfLifeHours, bodyWeightKg, vdLPerKg) {
  var remaining = calculateTotalRemaining(entries, queryTimestamp, halfLifeHours);
  if (remaining === null) return null;
  return calculateConcentration(remaining, bodyWeightKg, vdLPerKg);
}

function getPresetById(id) {
  for (var i = 0; i < HALF_LIFE_PRESETS.length; i++) {
    if (HALF_LIFE_PRESETS[i].id === id) return HALF_LIFE_PRESETS[i];
  }
  return null;
}

function formatElapsed(ms) {
  if (!isFiniteNumber(ms)) return "—";
  if (ms < 0) return "not yet";
  var totalMinutes = Math.floor(ms / 60000);
  var hours = Math.floor(totalMinutes / 60);
  var minutes = totalMinutes % 60;
  if (hours === 0) return minutes + "m";
  return hours + "h " + minutes + "m";
}

var exported = {
  DEFAULT_HALF_LIFE_HOURS: DEFAULT_HALF_LIFE_HOURS,
  SENSITIVITY_FAST_HOURS: SENSITIVITY_FAST_HOURS,
  SENSITIVITY_SLOW_HOURS: SENSITIVITY_SLOW_HOURS,
  LITERATURE_HALF_LIFE_MIN_HOURS: LITERATURE_HALF_LIFE_MIN_HOURS,
  LITERATURE_HALF_LIFE_MAX_HOURS: LITERATURE_HALF_LIFE_MAX_HOURS,
  DOSE_MAX: DOSE_MAX,
  MAX_DATE_TIMESTAMP: MAX_DATE_TIMESTAMP,
  DEFAULT_VD_L_PER_KG: DEFAULT_VD_L_PER_KG,
  OBESITY_VD_L_PER_KG: OBESITY_VD_L_PER_KG,
  BODY_WEIGHT_MIN_KG: BODY_WEIGHT_MIN_KG,
  BODY_WEIGHT_MAX_KG: BODY_WEIGHT_MAX_KG,
  HALF_LIFE_PRESETS: HALF_LIFE_PRESETS,
  validateHalfLife: validateHalfLife,
  validateDose: validateDose,
  validateTimestamp: validateTimestamp,
  validateBodyWeight: validateBodyWeight,
  validateVd: validateVd,
  calculateRemaining: calculateRemaining,
  calculateTotalRemaining: calculateTotalRemaining,
  calculateProjection: calculateProjection,
  calculateSensitivity: calculateSensitivity,
  calculateConcentration: calculateConcentration,
  calculateTotalConcentration: calculateTotalConcentration,
  getPresetById: getPresetById,
  getLocalDayBounds: getLocalDayBounds,
  calculateDailyConsumed: calculateDailyConsumed,
  calculateDailyEntryCount: calculateDailyEntryCount,
  generateProjectionSeries: generateProjectionSeries,
  generateChartData: generateChartData,
  formatElapsed: formatElapsed
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = exported;
}
if (typeof window !== "undefined") {
  window.CaffeineModel = exported;
}
