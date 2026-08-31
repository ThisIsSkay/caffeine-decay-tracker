# Caffeine Decay Tracker

A lightweight browser app that records caffeine dose events and estimates how much **parent caffeine remains** under a configurable first-order pharmacokinetic model.

**Live site:** https://thisisskay.github.io/caffeine-decay-tracker/

No backend, account, analytics, telemetry, CDN, or remote API is used. Intake records and settings stay in browser `localStorage`.

## What it does

- Record caffeine amount, local date/time, and an optional label
- Sum overlapping doses correctly by calculating every dose independently
- Show the selected-model estimate in mg
- Show a **3–8 hour adult sensitivity reference** alongside the selected result
- Project future values using the same calculation engine
- Plot the selected trajectory plus 3 h / 8 h reference trajectories
- Track caffeine actually consumed today (future scheduled events do not count until their time arrives)
- Edit/delete entries and persist them across reloads
- Handle local calendar boundaries, including 23-hour and 25-hour DST days

## Model

### Simple amount-remaining mode

The default model is a one-compartment, first-order elimination model with instantaneous absorption for the simple **mg remaining** view:

```text
remaining = dose × 0.5^(elapsed_hours / half_life_hours)
```

For arbitrary repeated doses:

```text
total(t) = Σ dose_i × 0.5^(-(t - t_i) / half_life)
           for all dose events with t_i <= t
```

Each dose keeps its own timestamp. Doses are never merged into one starting amount.

### Default and uncertainty

- Selected/default half-life: **5.0 h**
- Practical adult fast sensitivity scenario: **3.0 h**
- Practical adult slow sensitivity scenario: **8.0 h**
- Broader healthy-person literature range reviewed for this project: approximately **1.5–9.5 h**

The 3–8 h display is deliberately labelled a **sensitivity reference**, not a confidence interval and not a personalized biological range. The selected half-life can be changed independently.

Example: for a fully available 200 mg dose after 8 hours:

| Half-life model | Estimated parent caffeine remaining |
|---|---:|
| 3 h fast sensitivity | ~31.5 mg |
| 5 h nominal | ~66.0 mg |
| 8 h slow sensitivity | 100.0 mg |

The point of showing the sensitivity view is that uncertainty in a person's true elimination rate can matter more than arithmetic precision in the decay equation.

## Why absorption is still instantaneous here

The research basis reviewed for this project supports first-order oral absorption (Bateman-function modelling) when estimating early **concentration-time** behaviour. It also supports the simpler instantaneous model as a practical default for **amount remaining in mg**, especially once the main absorption phase has passed.

This version therefore keeps the simple amount-remaining model intentionally. A future advanced concentration mode could add body weight, apparent distribution volume, bioavailability, and an absorption rate without changing the simple mode.

## Important modelling boundaries

- This estimates **parent caffeine remaining under a mathematical model**, not measured blood caffeine concentration.
- It does not model caffeine metabolites such as paraxanthine.
- First-order elimination is an approximation. Human data show some dose dependence at higher exposure, but there is no universal Michaelis–Menten parameter set suitable as the default consumer model.
- Smoking, pregnancy, estrogen-containing oral contraceptives, liver dysfunction, drug interactions, and other factors can materially alter caffeine clearance. This app does not multiply such factors together or pretend to infer a personalized half-life from them.
- A manually selected half-life is a model parameter, not a measurement of the user's actual pharmacokinetics.

## Date/time behaviour

- Intake date/time is interpreted in the browser's local timezone.
- Elapsed time uses millisecond timestamps, so fractional minutes and seconds are retained in the calculation.
- Future events contribute 0 mg until their timestamp is reached.
- "Consumed today" uses local-midnight-to-next-local-midnight boundaries rather than assuming every day lasts exactly 24 hours.
- Nonexistent local times during a DST spring-forward transition are rejected instead of silently being shifted to another clock time.
- Repeated clock times during a DST fall-back transition remain a browser-local-time ambiguity; the basic HTML time input cannot distinguish the first occurrence from the second.

## Project structure

```text
index.html                 Page structure and accessible controls
styles.css                 Responsive dark UI
script.js                  UI, persistence, date/time validation, rendering
caffeine-model.js          Pure calculation engine
package.json               Test commands / Playwright dev dependency
tests/verify-caffeine.mjs  Unit/invariant tests
tests/verify-browser.mjs   Browser integration tests with deterministic clock
.github/workflows/test.yml GitHub Actions test workflow
research/                  Pharmacokinetic research basis and source links
```

## Running locally

The app itself has no runtime dependencies. Serve the repository root with any static server, for example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Tests

Install the development dependency and Playwright browser once:

```bash
npm install
npx playwright install chromium
```

Run everything:

```bash
npm test
```

Or separately:

```bash
npm run test:unit
npm run test:browser
```

The browser test starts its own local static server, uses Playwright's fake clock, and covers persistence, future scheduled doses, decimal doses, editing/deleting, the last-entry empty state, sensitivity output, mobile overflow, malformed stored values, and a DST spring-forward validation case.

The unit suite covers analytical half-life invariants, arbitrary-dose superposition, 3/5/8-hour sensitivity trajectories, future-dose exclusion, local-day totals, 23/25-hour DST calendar days, projection/chart data, validation, and floating-point precision.

## Privacy

Data is stored only under these browser keys:

- `caffeine-entries`
- `caffeine-halflife`

If localStorage is unavailable, the app continues to work for the current session without persistence.

## Research provenance

The pharmacokinetic assumptions used by this project are documented in [`research/README.md`](research/README.md), with the literature links cited by the original 32-page Deep Research report preserved in [`research/SOURCES.md`](research/SOURCES.md).

The exact PDF reviewed during development is identified there by filename and SHA-256 so a future copy can be verified against the same source material.