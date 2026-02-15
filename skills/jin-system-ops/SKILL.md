---
name: jin-system-ops
description: Build and operate a stable manual-first assistant system for Jin, including automation guardrails, issue hygiene, and phased rollout plans for MCP website CLI integrations. Use when the user asks to harden operations, reduce chaos, design resilient workflows, or add controlled automation.
---

# Jin System Ops

Run this skill when the goal is reliability-first operations.

## Core mode
- Default to **manual-first**.
- Add automation only after one stable manual loop exists.
- Keep one owner + one next action per issue.

## Workflow

1) Classify request
- `stability`: reduce noise/loops/duplicates
- `automation`: add controlled scheduled behavior
- `mcp-cli`: design or implement MCP website CLI flows

2) Apply guardrails
- Define trigger conditions clearly.
- Define stop conditions clearly.
- Add cooldown and duplicate prevention.
- Add fallback behavior (Jin proxy/manual path).

3) Ship in phases
- Phase A: manual baseline
- Phase B: single automation path
- Phase C: expand after KPI pass

4) Require acceptance checks
- No duplicate replies from one input
- Clear owner + next action
- Rollback command documented

## References
- For stabilization checklist: `references/stability-checklist.md`
- For automation rollout: `references/automation-rollout.md`
- For MCP website CLI roadmap: `references/mcp-website-cli.md`
- For reply quality gate: `references/response-qa.md`
- For post-task learning loop: `references/self-review-template.md`
- For anti-repeat incident tracking: `references/failure-log.md`

## Mandatory self-improvement loop
After each significant task:
1) Run Response QA checklist before final reply.
2) Write a 3-line self-review.
3) If failure/near-miss happened, append an entry to failure-log.

## Output format
Always return:
1) Current state
2) Proposed change
3) Risk
4) Next action
