# Jin Sprint Micro-Loop (10-minute run)

Purpose: ship one safe improvement in docs/skills/process files with low risk.

## 0) Scope gate (30s)
- Only touch: `docs/**`, `skills/**`, `*process*` files.
- No system config, infra, or external actions.

## 1) Pick one micro-change (2m)
- Clarify wording that caused confusion, **or**
- Add a checklist/template that reduces repeat mistakes, **or**
- Add a tiny guardrail note near a risky step.

## 2) Response QA gate (2m)
Use `skills/jin-system-ops/references/response-qa.md` and pass all 5 sections.
- If any section fails once, revise immediately and mark it as a near-miss for step 4.

## 3) 3-line self-review (2m)
Append to your run notes using:
- `skills/jin-system-ops/references/self-review-template.md`
- Include optional tags (`type`, `severity`, `repeat-risk`) to make trend review faster.

## 4) Failure logging rule (2m)
If any near-miss/rework happened (including QA fail-then-fix), append one entry to:
- `skills/jin-system-ops/references/failure-log.md`

## 5) Close with next micro-step (1m)
- Define one follow-up that fits in <=10 minutes.
- Keep it concrete and single-owner.

## 6) Progress update format (30s)
- Send max 4 lines: `What changed` + `Why it helps` + `Next micro-step`.
- Include touched file path to make verification easy.
- If a commit exists, include short SHA or link in line 4.

## 6.1) Continuous loop guardrails (for scheduled automation)
- Never return idle: each run must produce one concrete file diff, or an explicit blocker with evidence.
- Deduplicate by checking `git diff --name-only` first; avoid repeating the same change in consecutive runs.
- Stop condition: if scope is unclear or risk rises above docs/process changes, switch to "ask-human" note instead of forcing edits.
- Commit policy: commit only when change is coherent and reversible in one message.
- Evidence rule: every update must name touched file(s) + one measurable proof (`git diff --stat` or commit SHA).

## 6.2) Dirty workspace commit rule (important)
When unrelated files are already modified:
- Stage only your target file(s): `git add -- <path1> <path2>`
- Commit with scoped message: `docs(process): <micro-change>`
- Never bundle unrelated diffs into the same commit.
- If push is blocked (auth/remote), report blocker explicitly instead of claiming pushed.

## 6.3) Anti-repeat state stamp (for long loops)
Before editing, read last stamp from `.state/jin-loop-last.json` (create if missing).
- Required fields: `lastRunAt`, `lastTouchedFiles[]`, `lastCommit`, `nextHint`.
- Rule: do not touch the same primary file in 2 consecutive runs unless fixing a verified bug.
- After each run, update the stamp with the new file(s) + nextHint so the next cycle starts with context.
- If no safe file is available, write a blocker note in the stamp instead of making a low-value diff.

## 6.4) Push-proof guardrail (prevent false "pushed" claims)
Before reporting a push, run:
- `node scripts/jin-loop-push-proof.mjs --commit <sha> --branch <branch> --json`
Required pass conditions:
- HEAD SHA matches the commit you report.
- Branch matches expected branch.
- Upstream is configured and `ahead=0, behind=0` versus `@{u}`.
If any check fails, report status as `committed locally` and include the exact blocker (auth, remote reject, network).

## 7) Copy-paste run record (optional, 60s)
Use this block in your notes so each sprint run proves QA + learning loop happened.

```md
### Sprint run record
- Changed: <file path + one-line change>
- QA: PASS (clarity/actionability/correctness/scope/safety)
- Self-review:
  1) What worked: <one line>
  2) Friction: <one line>
  3) Next change: <one line>
- Failure log: none | added entry (<path>)
```

## 8) Thai 4-line update snippet (copy-paste)
Use this exact format for fast status updates (must match validator prefixes):

```md
เปลี่ยน: <เปลี่ยนอะไร> (<path>)
ช่วยได้: <ช่วยอะไร/ลดปัญหาอะไรแบบวัดผลได้>
ถัดไป: <งานเดียวที่ทำต่อใน 10 นาที>
หลักฐาน: <commit SHA/ลิงก์/หรือ blocker ที่ชัดเจน>
```

## 9) Report quality gate (before sending)
Quick-check these 4 points in <30 seconds:
- Line 1 contains exact changed file path.
- Line 2 states one measurable outcome (fewer repeats, clearer owner, faster triage, etc.).
- Line 3 includes honest risk level + brief reason.
- Line 4 names one concrete next step and, if committed, short SHA/link.

Machine-check (recommended):
- `node scripts/jin-loop-validate-th-report.mjs --file <report.txt>`
- Pass criteria: exactly 4 lines, required prefixes (`เปลี่ยน:/ช่วยได้:/ถัดไป:/หลักฐาน:`), and max line length guard.

If any point is missing, revise before posting the update.
