/* Caffeine decay calculation engine.
 *
 * Pure functions — no DOM, no side-effects, independently testable.
 *
 * Model: first-order exponential elimination.
 *   remaining = dose × 0.5 ^ (elapsed_hours / half_life_hours)
 *
 * Each dose decays independently from its own intake timestamp.
 * Instantaneous absorption is assumed (no absorption curve yet).
 */

// ── Validation ──────────────────────────────────────────────────

const HALF_LIFE_MIN = 0.5;
const HALF_LIFE_MAX = 24;
const DOSE_MAX = 5000;

function isFinitePositive(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function validateHalfLife(h) {
  if (!isFinitePositive(h)) return false;
  return h >= HALF_LIFE_MIN && h <= HALF_LIFE_MAX;
}

function validateDose(mg) {
  if (typeof mg !== "number" || !Number.isFinite(mg)) return false;
  if (mg < 0) return false;
  if (mg > DOSE_MAX) return false;
  return true;
}

// ── Core calculation ────────────────────────────────────────────

function calculateRemaining(doseMg, intakeTimestamp, nowTimestamp, halfLifeHours) {
  if (!validateDose(doseMg)) return null;
  if (!validateHalfLife(halfLifeHours)) return null;
  if (typeof intakeTimestamp !== "number" || typeof nowTimestamp !== "number") return null;
  if (!Number.isFinite(intakeTimestamp) || !Number.isFinite(nowTimestamp)) return null;

  if (doseMg === 0) return 0;

  var elapsedMs = nowTimestamp - intakeTimestamp;
  if (elapsedMs < 0) return 0;

  var elapsedHours = elapsedMs / (1000 * 60 * 60);
  return doseMg * Math.pow(0.5, elapsedHours / halfLifeHours);
}

function calculateTotalRemaining(entries, nowTimestamp, halfLifeHours) {
  if (!validateHalfLife(halfLifeHours)) return null;
  if (!Array.isArray(entries)) return null;

  var total = 0;
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var r = calculateRemaining(e.doseMg, e.intakeTimestamp, nowTimestamp, halfLifeHours);
    if (r === null) return null;
    total += r;
  }
  return total;
}

function calculateProjection(entries, timestamp, halfLifeHours) {
  return calculateTotalRemaining(entries, timestamp, halfLifeHours);
}

// ── Daily total ─────────────────────────────────────────────────

function calculateDailyConsumed(entries, nowTimestamp) {
  if (!Array.isArray(entries)) return 0;

  var now = new Date(nowTimestamp);
  var startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var endOfDay = startOfDay + 24 * 60 * 60 * 1000;

  var total = 0;
  for (var i = 0; i < entries.length; i++) {
    var ts = entries[i].intakeTimestamp;
    if (ts >= startOfDay && ts < endOfDay) {
      total += entries[i].doseMg || 0;
    }
  }
  return total;
}

// ── Projection series ───────────────────────────────────────────

function generateProjectionSeries(entries, nowTimestamp, halfLifeHours, steps) {
  if (!steps) steps = [0, 2, 4, 6, 8, 10, 12];
  var series = [];
  for (var i = 0; i < steps.length; i++) {
    var futureTs = nowTimestamp + steps[i] * 60 * 60 * 1000;
    var remaining = calculateProjection(entries, futureTs, halfLifeHours);
    if (remaining === null) return null;
    series.push({
      offsetHours: steps[i],
      timestamp: futureTs,
      remaining: remaining
    });
  }
  return series;
}

// ── Chart data ──────────────────────────────────────────────────

function generateChartData(entries, startTimestamp, endTimestamp, halfLifeHours, pointCount) {
  if (!pointCount) pointCount = 200;
  var step = (endTimestamp - startTimestamp) / pointCount;
  var points = [];
  for (var i = 0; i <= pointCount; i++) {
    var ts = startTimestamp + step * i;
    var remaining = calculateTotalRemaining(entries, ts, halfLifeHours);
    if (remaining === null) return null;
    points.push({ timestamp: ts, remaining: remaining });
  }
  return points;
}

// ── Elapsed formatting ──────────────────────────────────────────

function formatElapsed(ms) {
  if (ms < 0) return "not yet";
  var totalMinutes = Math.floor(ms / 60000);
  var hours = Math.floor(totalMinutes / 60);
  var minutes = totalMinutes % 60;
  if (hours === 0) return minutes + "m";
  return hours + "h " + minutes + "m";
}

// ── Exports (Node.js) / globals (browser) ───────────────────────

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    HALF_LIFE_MIN: HALF_LIFE_MIN,
    HALF_LIFE_MAX: HALF_LIFE_MAX,
    DOSE_MAX: DOSE_MAX,
    validateHalfLife: validateHalfLife,
    validateDose: validateDose,
    calculateRemaining: calculateRemaining,
    calculateTotalRemaining: calculateTotalRemaining,
    calculateProjection: calculateProjection,
    calculateDailyConsumed: calculateDailyConsumed,
    generateProjectionSeries: generateProjectionSeries,
    generateChartData: generateChartData,
    formatElapsed: formatElapsed
  };
}
