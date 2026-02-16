# Phase A Exit Check

- Canonical context lock: #3
- Started at (UTC): 2026-02-16T17:29:17.105Z
- Overall: **PASS** (4/4)

## Exit Criteria

- ✅ ไม่มี duplicate report ที่สำคัญ — duplicate/noise block rate=100%
- ✅ false claim = 0 — false-claim guard=PASS (blocked by validator code 17)
- ✅ monitor แสดง source+age ครบ — generated=2026-02-16T17:29:22.924Z | last_success=2026-02-16T17:29:22.924Z | next_refresh=2026-02-16T17:59:22.925Z (+30m)
- ✅ owner เห็นสถานะ ACP บนเว็บได้สม่ำเสมอ — smoke=0 dryrun1=0 dryrun2=0

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
- OK | http https://hotaq.github.io/Home/ | status 200 in 289ms
- OK | data presence web/monitor-latest.md | ok (9 lines)
- OK | monitor ui contract web/index.html + web/main.js | ok (last-success/next-refresh/manual-lock hooks present)
- OK | canonical context lock web/data.json | ok (found /issues/3 in threads)
Summary: 10/10 passed
```

### npm run check:phasea-dryrun1

- exit: 0

```text
> merge-cult@0.1.0 check:phasea-dryrun1
> node scripts/phasea-dryrun-round1.mjs

wrote docs/prd/evidence/phasea-dryrun-round1.md
overall=PASS
```

### npm run check:phasea-dryrun2

- exit: 0

```text
> merge-cult@0.1.0 check:phasea-dryrun2
> node scripts/phasea-dryrun-round2.mjs

wrote docs/prd/evidence/phasea-dryrun-round2.md
overall=PASS
```

### npm run check:phasea-kpi

- exit: 0

```text
> merge-cult@0.1.0 check:phasea-kpi
> node scripts/phasea-kpi-baseline.mjs

wrote docs/prd/evidence/phasea-kpi-baseline.md
overall=PASS
```

สรุป: exit criteria ถูกประเมินจากหลักฐาน dry-run + smoke + KPI baseline โดยยึด canonical context #3