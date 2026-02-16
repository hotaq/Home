# Phase A Dry-run รอบที่ 2 (interactive checks)

- Canonical context lock: #3
- Started at (UTC): 2026-02-16T17:09:47.734Z
- Overall: **PASS** (4/4)

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
- OK | http https://hotaq.github.io/Home/ | status 200 in 313ms
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
- Generated at: 2026-02-16T17:09:49.411Z
- Last successful check: 2026-02-16T17:09:49.411Z
- Next refresh (target): 2026-02-16T17:39:49.413Z (+30m)
- Site: OK (HTTP 200 in 143ms)
### GitHub API (issue probes)
- #1: OK (closed · 201ms)
- #3: OK (open · 185ms)
```

### node -e const fs=require('fs');const t=fs.readFileSync('web/monitor-latest.md','utf8');const req=['- Generated at:','- Last successful check:','- Next refresh (target):'];const miss=req.filter((x)=>!t.includes(x));if(miss.length){console.error('missing monitor metadata: '+miss.join(','));process.exit(1);}const m=t.match(/- Last successful check:\s*(.+)/);if(!m||!m[1]||m[1].trim()==='unknown'){console.error('last successful check is unknown');process.exit(1);}console.log('monitor metadata ok');

- exit: 0

```text
monitor metadata ok
```

### node -e const fs=require('fs');const s=fs.readFileSync('web/main.js','utf8');const req=['state.inFlight','state.queuedManual','Monitor: loaded from local cache','refreshBtn.disabled = true','refreshBtn.disabled = false'];const miss=req.filter((x)=>!s.includes(x));if(miss.length){console.error('missing lock/cache guards: '+miss.join(','));process.exit(1);}console.log('manual lock + cache guards present');

- exit: 0

```text
manual lock + cache guards present
```

สรุป: dry-run interactive baseline ผ่าน (monitor metadata + manual refresh lock/cache guardrails)