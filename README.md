# Caffeine Decay Tracker

A lightweight, browser-based caffeine intake tracker that estimates how much caffeine remains in your body using an exponential decay model. No backend, no login, no database — all data stays in your browser.

**Live site:** [https://thisisskay.github.io/caffeine-decay-tracker/](https://thisisskay.github.io/caffeine-decay-tracker/)

## What it does

- Record caffeine intakes with amount, time, date, and optional label
- See your **estimated caffeine remaining** in real time
- View a projection of future caffeine levels
- Track daily consumption totals
- Configure your personal caffeine half-life
- Visualise the decay curve on a timeline chart

## Caffeine calculation

### Formula

For a single dose:

```
remaining = dose × 0.5 ^ (elapsed_hours / half_life_hours)
```

Where:
- `dose` is the caffeine amount in milligrams
- `elapsed_hours` is the time since intake in hours (calculated from millisecond-precision timestamps)
- `half_life_hours` is the user-configured half-life (default: 5.0 hours)

### Multiple doses

Each caffeine intake decays independently from its own intake timestamp. The total estimated caffeine remaining is the sum of all individual remaining amounts:

```
total = remaining(dose_1) + remaining(dose_2) + ... + remaining(dose_n)
```

Doses are **never** combined into a single starting amount. Every dose tracks its own elapsed time.

### Future intakes

A dose scheduled in the future contributes 0 mg until its intake time is reached. It never produces negative elapsed time or values exceeding the original dose.

## Model assumptions

1. **Instantaneous absorption.** Each dose becomes fully available at the recorded intake timestamp. No absorption curve is modelled.
2. **First-order exponential decay.** Caffeine elimination follows `remaining = dose × 0.5^(t/t½)`.
3. **Single half-life.** One user-selected half-life applies to all doses.
4. **Estimate, not measurement.** The result is an estimate of caffeine remaining, not a measured blood concentration.
5. **Individual variation.** Real caffeine pharmacokinetics vary between people and circumstances — age, weight, genetics, pregnancy, medications, smoking, liver metabolism, and other factors all affect actual half-life.
6. **Pending research.** Biological assumptions (default half-life, absorption curves, individual variation) will be refined after separate research.

## Half-life

The default half-life of **5.0 hours** is a configurable model parameter, not a universally correct biological constant. Users can adjust it between 0.5 and 24 hours. Changing the half-life immediately recalculates all existing entries.

## Privacy

- All caffeine records are stored in browser `localStorage`
- No data is sent to any server
- No analytics, telemetry, or tracking
- No external API calls
- No CDN dependencies
- Everything runs locally in your browser

## Running locally

Open `index.html` directly in a browser, or serve it:

```
npx http-server . -p 8080
```

Then visit `http://localhost:8080`.

## Running tests

Tests verify the calculation engine independently of the UI:

```
node tests/verify-caffeine.mjs
```

No test framework required — runs with plain Node.js.

### What the tests cover

- Zero, one, two, and three half-lives elapsed
- Fractional half-life intervals (e.g. 2.5 hours at half-life 5)
- Multiple doses at same time
- Different intake times with independently calculated results
- Future entries contributing 0 mg
- Entry exactly at intake timestamp
- Invalid half-life values (0, negative, NaN, Infinity)
- Invalid dose values (negative, NaN, Infinity; zero accepted as valid)
- Cross-midnight calculations
- Fractional minutes/seconds precision
- Multiple doses including future entries
- Projection including/excluding future intakes
- Daily consumed totals excluding previous days
- Empty entries
- Various half-life values
- Validation bounds
- Elapsed time formatting
- Invalid entries arrays
- Projection series generation
- Invalid timestamps

## Project structure

```
caffeine-decay-tracker/
  index.html              Main page
  styles.css              All styling
  script.js               UI logic, state management, persistence
  caffeine-model.js       Calculation engine (pure functions, no DOM)
  tests/
    verify-caffeine.mjs   Automated tests for the calculation engine
  .gitignore
  README.md
```

### Architecture

The calculation engine (`caffeine-model.js`) contains all caffeine math as pure, side-effect-free functions. It has no DOM dependencies and can be tested independently with Node.js.

The UI layer (`script.js`) handles rendering, user interaction, and localStorage persistence. It calls the calculation engine for all caffeine-related math — there is one source of truth for the decay formula.

### Key functions in the calculation engine

| Function | Purpose |
|----------|---------|
| `calculateRemaining(dose, intakeTs, nowTs, halfLife)` | Single-dose remaining caffeine |
| `calculateTotalRemaining(entries, nowTs, halfLife)` | Sum of all doses' remaining caffeine |
| `calculateProjection(entries, ts, halfLife)` | Remaining at any point in time |
| `calculateDailyConsumed(entries, nowTs)` | Total mg consumed on the local calendar date |
| `generateProjectionSeries(entries, nowTs, halfLife, steps)` | Array of future remaining values |
| `generateChartData(entries, start, end, halfLife, points)` | Dense time series for chart rendering |
| `validateHalfLife(h)` | Validates half-life is a finite positive number in range |
| `validateDose(mg)` | Validates dose is a finite non-negative number in range |

## localStorage

Data is stored under two keys:

| Key | Contents |
|-----|----------|
| `caffeine-entries` | JSON array of intake records (id, doseMg, intakeTimestamp, label) |
| `caffeine-halflife` | Half-life value as a string |

Malformed or corrupted stored values are handled gracefully — the app falls back to defaults rather than crashing. If localStorage is unavailable (e.g. blocked cookies), the app functions normally during the current session without persistence.

## Date and time handling

- Internally uses JavaScript timestamps (milliseconds since epoch)
- User-entered times represent the browser's local timezone
- Elapsed time is calculated as `currentTimestamp - intakeTimestamp` in milliseconds, then converted to hours — no rounding before the exponential calculation
- Correctly handles: cross-midnight entries, month/year boundaries, entries from previous days, future entries, and daylight-saving environments

## Floating-point handling

JavaScript floating-point arithmetic is used throughout. No intermediate values are rounded. Rounding is applied only for display:
- Main reading: 1 decimal place (e.g. 217.4 mg)
- Entry breakdown: 1 decimal place
- Projections: rounded to nearest integer
- Tests use appropriate numerical tolerances

## Browser support

Works in all modern browsers with ES5+ support:
- Chrome / Edge 80+
- Firefox 78+
- Safari 14+
- Mobile Safari / Chrome for Android

Uses: `localStorage`, `Date.now()`, `Math.pow()`, `Array.prototype.filter`, `template strings` (in tests only — the main app uses ES5-compatible string concatenation).
