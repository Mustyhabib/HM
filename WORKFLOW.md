# WORKFLOW.md — Research and Engineering Workflow

## Research Workflow

### Step 1 — Question
Capture the question in natural language.

### Step 2 — Formal hypothesis
Convert the question into a falsifiable hypothesis.

### Step 3 — Experiment specification
Freeze:

- universe
- timeframe
- dataset version
- feature definitions
- strategy definition
- evaluation metric
- costs
- slippage
- train/validation/test windows
- stopping criteria

### Step 4 — Data validation
Check:

- missing data
- duplicates
- time ordering
- stale observations
- corporate actions
- point-in-time availability
- symbol mapping
- provider provenance

### Step 5 — Baseline
Always establish a simple baseline before adding ML/RL.

### Step 6 — Model/strategy
Run deterministic, ML or RL experiments.

### Step 7 — Validation
Run:

- out-of-sample
- walk-forward
- parameter perturbation
- regime analysis
- stress testing
- realistic transaction costs/slippage

### Step 8 — Promotion
Only validated strategies move to paper.

### Step 9 — Paper
Run against realtime data with simulated execution.

### Step 10 — Shadow/live readiness
Compare expected versus realized behavior and reconcile state.

### Step 11 — Controlled live
Only after explicit approval, with hard risk limits.

## Software Development Workflow

### Before coding

- read relevant modules
- locate domain owner
- identify current contracts
- check tests
- check data migrations
- check licensing if vendor code is involved

### During coding

- make the smallest coherent change
- preserve existing behavior where possible
- add or update tests
- add structured logging/metrics for important asynchronous work

### Before merge

- unit tests
- integration tests
- type/static checks
- migration checks if applicable
- security checks for secrets/auth
- architecture impact review
- documentation update

### After merge

- verify deployment
- inspect metrics/logs
- verify background jobs
- verify realtime paths
- confirm no unexpected cost increase

## Incident Workflow

1. Stop unsafe behavior.
2. Preserve evidence and audit events.
3. Identify affected tenants/strategies/accounts.
4. Reconcile state.
5. Restore service safely.
6. Write root-cause analysis.
7. Add a regression test or control.

## Model Promotion Workflow

```text
Candidate
  ↓
Validated
  ↓
Paper
  ↓
Shadow
  ↓
Approved
  ↓
Live
```

A model should be versioned and immutable once promoted.
