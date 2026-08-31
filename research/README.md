# Research basis

This folder preserves the research basis used to choose the mathematical model and defaults for the caffeine tracker.

## Original research report

**Title:** *Caffeine Decay Mathematics in the Human Body: A Pharmacokinetic Basis for a Caffeine Calculator*

The working source was a 32-page Deep Research PDF supplied during development.

Original PDF filename:

```text
Caffeine Decay Mathematics in the Human Body_ A Pharmacokinetic Basis for a Caffeine Calculator.pdf
```

SHA-256 of the exact PDF reviewed:

```text
0812f5cf5684b959908103baa750678aa5f516236ccfe9536115f254a3307f2d
```

The current GitHub connector available to this project only supports UTF-8 text writes and cannot commit the binary PDF directly. This folder therefore records the report's conclusions, model equations, implementation recommendations, and original literature links so the basis for the app remains auditable inside the repository.

## Main conclusion used by the app

For a general-purpose caffeine **amount remaining** calculator, the report recommends a one-compartment, first-order elimination model as the simplest defensible default.

For a fully available dose:

```text
A(t) = A0 × exp(-k × t)

k = ln(2) / half_life
```

Equivalent half-life form:

```text
A(t) = A0 × 2^(-t / half_life)
```

For arbitrary repeated doses, linearity permits superposition:

```text
A(t) = Σ Di × 2^(-(t - ti) / half_life)
       for every dose with ti <= t
```

This is the mathematical core implemented by `caffeine-model.js`.

## Recommended default and uncertainty display

The report recommends:

| Parameter / scenario | Research recommendation |
|---|---:|
| Nominal healthy-adult half-life | 5.0 h |
| Practical fast sensitivity | 3.0 h |
| Practical slow sensitivity | 8.0 h |
| Broader healthy-person literature envelope | ~1.5–9.5 h |

The 3–8 h band is an **engineering sensitivity interval**, not a reported percentile or 95% confidence interval.

That distinction is important. The app should not imply that a person's true caffeine amount is known exactly just because the exponential arithmetic is exact conditional on a chosen half-life.

Example from the report for a 200 mg dose after 8 hours:

| Half-life | Estimated parent caffeine remaining |
|---|---:|
| 3 h | ~31.5 mg |
| 5 h | ~66.0 mg |
| 8 h | 100.0 mg |

The large spread demonstrates that uncertainty in the individual's elimination rate is often more important than numerical precision in the decay equation.

## Oral absorption

The report distinguishes between two useful levels of modelling.

### Simple amount-remaining mode

Instantaneous availability plus first-order elimination is acceptable as a simple model for **parent caffeine remaining in mg**, particularly after the main absorption phase.

### Concentration-time mode

For early plasma concentration behaviour, the report recommends optional first-order oral absorption using the Bateman function:

```text
C(t) = F × D × ka / (Vd × (ka - ke))
       × (exp(-ke × t) - exp(-ka × t))
```

where:

- `D` = caffeine dose
- `F` = systemic bioavailability
- `Vd` = apparent distribution volume
- `ka` = absorption rate constant
- `ke` = elimination rate constant

Suggested engineering defaults discussed in the report include:

- `F = 1.0`
- `Vd ≈ 0.60 L/kg`
- `ka ≈ 6 h^-1` as an engineering approximation, not a universal physiological constant

The current app intentionally does **not** expose concentration mode yet. This keeps the simple tracker aligned with information ordinary users actually know: dose, timestamp, and a half-life assumption.

## Model hierarchy

The report treats caffeine pharmacokinetic models as a hierarchy rather than assuming one model is universally true:

1. **One-compartment, instantaneous absorption** — recommended default for simple mg-remaining calculations.
2. **One-compartment + first-order absorption** — recommended concentration-time model when early absorption matters.
3. **Two-compartment models** — potentially better for richer clinical datasets but overparameterized for ordinary user input.
4. **Michaelis–Menten elimination** — useful as an experimental sensitivity model because dose-dependence exists, but no universal `Km`/`Vmax` pair is established for consumer use.
5. **PBPK / mechanistic models** — research-grade, with too many physiological inputs for this app's basic purpose.

## Dose dependence

The research notes that first-order kinetics are an approximation rather than a physical law. Human dose-ranging studies have reported reduced clearance and longer half-life at larger doses, including roughly 4.5 h around 70 mg versus around 6.0–6.4 h in the 200–300 mg range in one study.

However, the report explicitly does **not** recommend replacing the default model with Michaelis–Menten elimination because a robust universal population parameter set is not available.

The practical consequence for this project is:

- keep first-order decay as the transparent default;
- describe high-dose estimates as increasingly uncertain;
- do not invent nonlinear parameters.

## Biological covariates

The report identifies several factors that can materially change caffeine clearance.

Representative scenario values discussed include:

| Scenario | Approximate research scenario |
|---|---:|
| Typical healthy adult | 5 h |
| Current cigarette smoker | ~3.5 h |
| Estrogen-containing oral contraceptive | ~7.5–8 h; representative study mean ~7.9 h |
| Late pregnancy | ~10–10.5 h |
| Severe/decompensated cirrhosis | no single reliable default; can exceed 10 h and may be much longer |
| CYP1A2 genotype alone | no fixed numerical multiplier recommended |

The report strongly warns against multiplying these scenario ratios together. Their effects are not established as independent multiplicative constants.

For that reason the current app keeps a user-configurable half-life rather than presenting a questionnaire that pretends to derive an individual's metabolism precisely.

## Habitual/repeated caffeine intake

A key conclusion is that chronic caffeine use should first be modelled by **actual overlapping dose history**.

Under linear first-order kinetics, each dose creates its own exponential tail and all eligible contributions add together. No separate "habitual user build-up factor" is necessary.

This directly supports the app's event-based architecture.

## What the calculator can legitimately claim

A defensible result is of the form:

> Under a one-compartment first-order model with a 5-hour half-life, an estimated 66 mg of a fully available 200 mg caffeine dose remains after eight hours. Using 3- and 8-hour sensitivity scenarios, the estimate is roughly 31–100 mg.

The app should **not** claim that it knows a user's true measured blood caffeine concentration from dose and clock time alone.

The research's overall design principle is:

```text
simple deterministic core + explicit biological uncertainty
```

## Software validation recommendations carried into the project

The report recommends analytical invariants before comparing a program against clinical data. These include:

- `A(0) = dose`
- `A(half_life) = dose / 2`
- `A(2 × half_life) = dose / 4`
- a single-event history must reproduce the single-dose formula
- two identical simultaneous doses must equal one dose with twice the amount
- splitting 200 mg into 100 mg + 100 mg at the same timestamp must produce the same trajectory
- future events contribute zero until their timestamp
- repeated-dose calculations use one consistent half-life scenario across the events unless the metabolic state itself changes

These invariants are represented in the repository's unit and browser regression suites.

## Source links

The original report cited primary studies, reviews, and population-PK literature. They are preserved in [`SOURCES.md`](SOURCES.md).

## Provenance note

This document is a project research record derived from the supplied Deep Research report. It is not intended to replace the underlying papers. When implementation decisions depend on a specific pharmacokinetic claim, reviewers should follow the original literature links in `SOURCES.md` and verify the claim against the primary source.