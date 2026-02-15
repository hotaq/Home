# Failure Log (Anti-repeat)

Record recurring failure patterns and fixes to prevent repeats.

## Entry format
- Date:
- Symptom:
- Root cause:
- Fix applied:
- Verification:
- Prevention rule:

---

## Example (failure)
- Date: 2026-02-15
- Symptom: Mention router triggered duplicate proxy spam
- Root cause: Parsed mentions from long report body + unknown handles
- Fix applied: First-line-only parsing + ignore system handles
- Verification: Router tests passed (6 cases)
- Prevention rule: Any mention parser change must pass `npm run test:router`

## Example (near-miss)
- Date: 2026-02-15
- Symptom: Sprint update was too long and unclear for quick review
- Root cause: No fixed short output format in process doc
- Fix applied: Added Thai 4-line copy-paste update snippet in `docs/process/jin-sprint-micro-loop.md`
- Verification: Subsequent sprint updates followed 4-line format with file path included
- Prevention rule: If QA fails once and is revised, log as near-miss in this file
