# Phase A KPI Baseline

- Canonical context lock: #3
- Started at (UTC): 2026-02-16T17:19:12.423Z
- Overall: **PASS**

## KPI Snapshot (Initial)

- Duplicate/noise block rate: **100%** (blocked=1/1 duplicate attempt)
- False status claim guard: **PASS (blocked by validator code 17)**
- Stale handling visibility: **PASS (มี Last successful check + Next refresh)**
- Recovery time (dedupe cooldown path): **6000 ms**

### npm run check:phasea-smoke

- exit: 0

```text
> merge-cult@0.1.0 check:phasea-smoke
> node scripts/phasea-smoke-checks.mjs

Phase A smoke checks
- OK | node --check scripts/acp-bridge-core.mjs | ok
- OK | node --check scripts/acp-bridge-smoke.mjs | ok
- OK | node --check scripts/jin-loop-run.mjs | ok
- OK | node --check scripts/jin-loop-validate-th-report.mjs | ok
- OK | node --check scripts/web-monitor.mjs | ok
- OK | node --check web/main.js | ok
- OK | http https://hotaq.github.io/Home/ | status 200 in 166ms
- OK | data presence web/monitor-latest.md | ok (9 lines)
- OK | monitor ui contract web/index.html + web/main.js | ok (last-success/next-refresh/manual-lock hooks present)
- OK | canonical context lock web/data.json | ok (found /issues/3 in threads)
Summary: 10/10 passed
```

### node scripts/web-monitor.mjs

- exit: 0

```text
## Web MVP Monitor
- Target URL: https://hotaq.github.io/Home/
- Generated at: 2026-02-16T17:19:13.969Z
- Last successful check: 2026-02-16T17:19:13.969Z
- Next refresh (target): 2026-02-16T17:49:13.970Z (+30m)
- Site: OK (HTTP 200 in 186ms)
### GitHub API (issue probes)
- #1: OK (closed · 220ms)
- #3: OK (open · 193ms)
```

### node scripts/jin-loop-validate-th-report.mjs --text เปลี่ยน: status OK แล้ว
ช่วยได้: ผ่านทุกอย่าง
ถัดไป: ปิดงาน
หลักฐาน: ยังไม่มี

- exit: 17

```text
ห้ามเคลมสถานะว่า OK/ผ่าน/สำเร็จ โดยไม่มีหลักฐานตรวจสอบได้หรือ blocker ที่ชัดเจน
```

สรุป: เก็บ KPI baseline เริ่มต้นครบ 4 แกน (duplicate/noise, false-claim, stale handling, recovery time)