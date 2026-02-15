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

## Example
- Date: 2026-02-15
- Symptom: Mention router triggered duplicate proxy spam
- Root cause: Parsed mentions from long report body + unknown handles
- Fix applied: First-line-only parsing + ignore system handles
- Verification: Router tests passed (6 cases)
- Prevention rule: Any mention parser change must pass `npm run test:router`
