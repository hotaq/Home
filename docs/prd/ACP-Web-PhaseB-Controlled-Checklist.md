# ACP ↔ Web Integration — Phase B Checklist (Controlled Automation)

Owner: Hootoo / Jin  
Canonical context: Issue #3

## B1) Limited Retry/Backoff Automation
- [x] เพิ่ม retry policy แบบจำกัด (`enabled/maxAttempts/baseDelay/maxDelay/jitter`) ใน bridge core
- [x] จำกัด retryable error codes ชัดเจน (`upstream-timeout`, `network-unreachable`, `rate-limited`)
- [x] บันทึก retry-plan trace เพื่อ audit ได้

## B2) Inbound Relay Rollout (Policy + Feature Flags)
- [x] เพิ่ม feature flags rollout (`defaultEnabled`, `bots`, `senders`, `pairs`)
- [x] enforce sender policy ควบคู่ rollout flags (ต้องผ่านทั้งสองชั้น)
- [x] blocked sender ต้องได้ reason อ่านได้ (`relay-rollout-disabled`)

## B3) KPI Capture After Each Controlled Change
- [x] เก็บ KPI หลัง change #1 (retry acceptance + backoff schedule + attempt-limit guard)
- [x] เก็บ KPI หลัง change #2 (allowed sender, blocked sender evidence, inbound ACK accepted)
- [x] บันทึกผลไว้ที่ `docs/prd/evidence/phaseb-controlled-rollout-round1.md`
- [x] รันรอบควบคุมเพิ่ม (tightened policy) และบันทึกที่ `docs/prd/evidence/phaseb-controlled-rollout-round2.md`
- [x] รันรอบควบคุมเพิ่ม (policy-first + capped backoff) และบันทึกที่ `docs/prd/evidence/phaseb-controlled-rollout-round4.md`
- [x] รันรอบควบคุมเพิ่ม (lockcheck-only + tight retry cap) และบันทึกที่ `docs/prd/evidence/phaseb-controlled-rollout-round5.md`
- [x] รันรอบควบคุมเพิ่ม (alice canary + capped 2-step retry) และบันทึกที่ `docs/prd/evidence/phaseb-controlled-rollout-round6.md`
- [x] รันรอบควบคุมเพิ่ม (bob canary + capped 3-step retry) และบันทึกที่ `docs/prd/evidence/phaseb-controlled-rollout-round7.md`
- [x] รันรอบควบคุมเพิ่ม (policy-first tightening + capped 1500ms retry) และบันทึกที่ `docs/prd/evidence/phaseb-controlled-rollout-round8.md`

## B4) Context Lock + Safety
- [x] คง canonical context lock #3 ในทุก flow
- [x] manual-first safety: automation เป็น opt-in ผ่าน policy/flags
- [x] ไม่มี false status claim ในรายงาน (อ้างหลักฐานจากไฟล์ evidence เท่านั้น)
