---
name: github-issue-autofix
description: Automate GitHub issue handling end-to-end: triage, reply, implement fix, validate, and post closure updates. Use when the user asks to auto-answer issues, propose patches, or resolve issue threads with practical code changes similar to oracle-style execution.
---

# GitHub Issue AutoFix

Use this skill to handle issues with execution-first flow.

## Modes
- **Reply-only mode**: answer/triage without code changes.
- **Fix mode**: implement patch + validate + closure update.
- **Blocked mode**: post exact blocker and required input.

## Trigger phrases (examples)
- "fix issue #..."
- "ตอบ issue และแก้เลย"
- "auto answer and fix"
- "handle this GitHub bug end-to-end"

## Flow
1) Read issue context
- Pull issue body, labels, latest comments.
- Classify: bug / enhancement / question / process.
- Extract acceptance criteria (explicit/implicit).

2) Post fast acknowledgement
- Reply quickly with: understanding, plan, ETA.
- Keep it short and actionable.

3) Reproduce + implement (Fix mode)
- Find target files.
- Apply smallest safe patch first.
- Prefer reversible changes.
- Keep scope strictly within issue acceptance criteria.

4) Validate
- Run relevant tests/lint/build.
- If no tests exist, run a minimal smoke check.
- Capture concrete command outputs for issue evidence.

5) Report in issue
- Post summary with:
  - what changed
  - why it fixes the issue
  - verification result
  - follow-up if needed

6) Close or route
- Close when done and validated.
- If blocked, post blocker + exact next requirement.

## Guardrails
- Never claim fixed without validation output.
- Do not expand scope without explicit request.
- Use one issue thread as source of truth.
- Use Closure Card format for final wrap-up.
- If confidence is low, switch to Reply-only mode and ask one precise question.

## Response formats
- For first response and closure response templates, use `references/reply-templates.md`.
- For execution checklist, use `references/execution-checklist.md`.
- For handoff/blocked wording, use `references/reply-templates.md` blocked template.
