# Evaluation Harness

Offline multi-turn evaluation for the Clinic Voice AI receptionist.

## Run

```bash
npm run evaluate
```

Optional:

```bash
node evaluation/scripts/runEvaluate.js --scenario english-booking
node evaluation/scripts/runEvaluate.js --out evaluation/reports/custom
```

## Layout

- `scenarios/` — multi-turn scenario definitions
- `runner/` — scenario execution + assertions
- `metrics/` — aggregate metric computation
- `reports/` — JSON / Markdown / CSV writers (+ generated output)
- `scripts/` — CLI entrypoint
