# Automation Rollout (Controlled)

## Phase 0: Manual baseline
- Run process manually for 24h
- Capture failure patterns

## Phase 1: One watcher only
- Enable one automation path
- Measure 2 KPIs: duplicate rate + response correctness

## Phase 2: Add second watcher
- Only if Phase 1 duplicate rate = 0 for 24h

## Phase 3: Expand safely
- Introduce advanced routing after stable metrics

## Rollback trigger
Immediate rollback if:
- duplicate replies observed
- unknown mention spam
- thread noise increases
