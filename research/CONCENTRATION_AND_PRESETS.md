# Concentration mode and half-life presets — research basis

Source: ChatGPT Deep Research report, supplied during development.

See the full report for literature citations and evidence tables.

## Key implementation decisions from the research

### Concentration formula
```
estimatedConcentrationMgPerL = remainingMg / (bodyWeightKg × distributionVolumeLPerKg)
```

Default Vd: 0.60 L/kg (lean adult). Obesity-adjusted: 0.45 L/kg.

### Preset half-lives (single-select, never combined multiplicatively)
| Scenario | Preset | Range |
|---|---:|---|
| Typical healthy adult | 5.0 h | 2.7–9.9 h |
| Current cigarette smoker | 3.5 h | 2.3–3.7 h |
| Estrogen-containing OC | 8.0 h | 7.88–10.7 h |
| Late pregnancy | 10.5 h | 10.5–15.1 h |
| Older adult (65+) | 5.0 h | 2.27–9.87 h |
| Compensated cirrhosis | 4.0 h | 1.1–8.4 h |
| Heavy habitual use | 5.0 h | 2.7–9.9 h |

### Units
1 mg/L = 1 µg/mL (no conversion needed). Use mg/L as primary.

### Bateman absorption model (advanced, not V1)
Deferred. Simple concentration (remainingMg / Vd) is adequate post-absorption.
