---
name: cult-automation
description: Automate The Merge Cult operations on GitHub. Use when handling ritual commands (/ritual, /council vote), triaging issue structure, posting governance summaries, running weekly trial check-ins, or keeping issue threads clean and role-routed (Jin, Nanta, shoji, Hootoo).
---

# Cult Automation

Use this workflow to keep repo operations clean and consistent.

## 1) Classify incoming request
- Treat governance policy changes as `governance`.
- Treat daily KPI/protocol execution as `trial-board`.
- Treat member joining/promotions as `recruitment`.
- Route to one canonical issue per stream.

## 2) Apply issue hygiene
- Add/update labels: `governance`, `trial-board`, `recruitment`, `archived`.
- Close threads that are discussion-complete.
- Post one closing summary with explicit next issue link.

## 3) Ritual automation pattern
- For `/ritual <topic>`, produce 3 views:
  - Strategy (Jin)
  - Risk challenge (Nanta)
  - Implementation (Scribe/shoji)
- End with one consolidated recommendation and one clear next decision.

## 4) Council vote pattern
- Convert discussion to one vote line:
  - Proposal
  - Options: YES / NO / AMEND
  - Timebox
- Prevent vote sprawl; keep one active vote per issue.

## 5) Weekly trial maintenance
- Update/checklist in `cult/week1-trial-checklist.md`.
- Track KPI pair only:
  - reopen rate (<15%)
  - decision speed (<=48h)
- At week end, use `cult/week1-retro-template.md` and publish adopt/amend/rollback decision.

## 6) Safety and anti-chaos
- Never allow bot loops; stop after one round per role unless user asks to continue.
- Keep human override absolute: Hootoo final decision.
- Keep comments concise, actionable, and linked to one next action.
