#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const canonicalContextId = String(process.env.CANONICAL_CONTEXT_ID || '3');
const evidencePath = process.env.EVIDENCE_PATH || 'docs/prd/evidence/phasea-dryrun-round2.md';

function run(command, args) {
  const proc = spawnSync(command, args, { encoding: 'utf8' });
  const output = [proc.stdout, proc.stderr].filter(Boolean).join('').trim();
  return {
    command: [command, ...args].join(' '),
    code: proc.status ?? 1,
    ok: proc.status === 0,
    output: output || '(no output)'
  };
}

function toSection(result) {
  return [
    `### ${result.command}`,
    '',
    `- exit: ${result.code}`,
    '',
    '```text',
    result.output,
    '```',
    ''
  ].join('\n');
}

function main() {
  const startedAt = new Date().toISOString();

  const checks = [
    run('npm', ['run', 'check:phasea-smoke']),
    run('node', ['scripts/web-monitor.mjs']),
    run('node', [
      '-e',
      [
        "const fs=require('fs');",
        "const t=fs.readFileSync('web/monitor-latest.md','utf8');",
        "const req=['- Generated at:','- Last successful check:','- Next refresh (target):'];",
        "const miss=req.filter((x)=>!t.includes(x));",
        "if(miss.length){console.error('missing monitor metadata: '+miss.join(','));process.exit(1);}",
        "const m=t.match(/- Last successful check:\\s*(.+)/);",
        "if(!m||!m[1]||m[1].trim()==='unknown'){console.error('last successful check is unknown');process.exit(1);}",
        "console.log('monitor metadata ok');"
      ].join('')
    ]),
    run('node', [
      '-e',
      [
        "const fs=require('fs');",
        "const s=fs.readFileSync('web/main.js','utf8');",
        "const req=['state.inFlight','state.queuedManual','Monitor: loaded from local cache','refreshBtn.disabled = true','refreshBtn.disabled = false'];",
        "const miss=req.filter((x)=>!s.includes(x));",
        "if(miss.length){console.error('missing lock/cache guards: '+miss.join(','));process.exit(1);}",
        "console.log('manual lock + cache guards present');"
      ].join('')
    ])
  ];

  const failed = checks.filter((x) => !x.ok);
  const status = failed.length === 0 ? 'PASS' : 'FAIL';

  const body = [
    '# Phase A Dry-run รอบที่ 2 (interactive checks)',
    '',
    `- Canonical context lock: #${canonicalContextId}`,
    `- Started at (UTC): ${startedAt}`,
    `- Overall: **${status}** (${checks.length - failed.length}/${checks.length})`,
    '',
    ...checks.map((x) => toSection(x)),
    failed.length === 0
      ? 'สรุป: dry-run interactive baseline ผ่าน (monitor metadata + manual refresh lock/cache guardrails)'
      : `สรุป: พบข้อผิดพลาด ${failed.length} รายการ ต้องแก้ก่อนปิด Phase A`
  ].join('\n');

  const abs = path.resolve(evidencePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf8');

  console.log(`wrote ${evidencePath}`);
  console.log(`overall=${status}`);

  if (failed.length > 0) process.exit(1);
}

main();
