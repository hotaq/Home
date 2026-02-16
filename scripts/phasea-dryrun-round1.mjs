#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const canonicalContextId = String(process.env.CANONICAL_CONTEXT_ID || '3');
const evidencePath = process.env.EVIDENCE_PATH || 'docs/prd/evidence/phasea-dryrun-round1.md';

function runCommand(command, args) {
  const proc = spawnSync(command, args, { encoding: 'utf8' });
  const output = [proc.stdout, proc.stderr].filter(Boolean).join('').trim();
  return {
    ok: proc.status === 0,
    code: proc.status ?? 1,
    command: [command, ...args].join(' '),
    output
  };
}

function toSection(result) {
  return [
    `### ${result.command}`,
    '',
    `- exit: ${result.code}`,
    '',
    '```text',
    result.output || '(no output)',
    '```',
    ''
  ].join('\n');
}

function main() {
  const startedAt = new Date().toISOString();
  const checks = [
    runCommand('npm', ['run', 'check:acp-bridge']),
    runCommand('npm', ['run', 'check:phasea-smoke'])
  ];

  const failed = checks.filter((x) => !x.ok);
  const status = failed.length === 0 ? 'PASS' : 'FAIL';

  const body = [
    '# Phase A Dry-run รอบที่ 1 (system-level)',
    '',
    `- Canonical context lock: #${canonicalContextId}`,
    `- Started at (UTC): ${startedAt}`,
    `- Overall: **${status}** (${checks.length - failed.length}/${checks.length})`,
    '',
    ...checks.map((x) => toSection(x)),
    failed.length === 0
      ? 'สรุป: dry-run system-level ผ่านครบทั้ง bridge + smoke checks'
      : `สรุป: พบข้อผิดพลาด ${failed.length} รายการ ต้องแก้ก่อนปิด Phase A`
  ].join('\n');

  const abs = path.resolve(evidencePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf8');

  console.log(`wrote ${evidencePath}`);
  console.log(`overall=${status}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main();
