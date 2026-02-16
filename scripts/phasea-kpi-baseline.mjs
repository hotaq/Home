#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createBridgeHandlers } from './acp-bridge-core.mjs';

const canonicalContextId = String(process.env.CANONICAL_CONTEXT_ID || '3');
const evidencePath = process.env.EVIDENCE_PATH || 'docs/prd/evidence/phasea-kpi-baseline.md';

function run(command, args) {
  const proc = spawnSync(command, args, { encoding: 'utf8' });
  return {
    command: [command, ...args].join(' '),
    code: proc.status ?? 1,
    ok: proc.status === 0,
    output: [proc.stdout, proc.stderr].filter(Boolean).join('').trim() || '(no output)'
  };
}

function kpiFromBridgeSimulation() {
  let nowMs = 1_700_000_000_000;
  const handlers = createBridgeHandlers({
    cooldownMs: 5_000,
    canonicalContextId,
    senderPolicy: { relayA: ['alice'] },
    inboundRateLimit: { windowMs: 10_000, maxEvents: 2 },
    now: () => nowMs
  });

  const baseline = handlers.send({ contextId: canonicalContextId, source: 'manual', payload: { text: 'kpi-baseline' } });
  const duplicate = handlers.send({ contextId: canonicalContextId, source: 'manual', payload: { text: 'kpi-baseline' } });
  nowMs += 6_000;
  const recovery = handlers.send({ contextId: canonicalContextId, source: 'manual', payload: { text: 'kpi-baseline' } });

  const blockedDuplicates = duplicate.ok ? 0 : 1;
  const duplicateAttempts = 1;
  const duplicateBlockRate = Math.round((blockedDuplicates / duplicateAttempts) * 100);

  return {
    baselineOk: baseline.ok,
    duplicateBlocked: !duplicate.ok,
    recoveredAfterCooldown: recovery.ok,
    duplicateBlockRate,
    cooldownRecoveryMs: 6_000
  };
}

function readMonitorMetadata() {
  const monitorPath = path.resolve('web/monitor-latest.md');
  if (!fs.existsSync(monitorPath)) {
    return { ok: false, reason: 'monitor-latest.md not found' };
  }

  const text = fs.readFileSync(monitorPath, 'utf8');
  const generated = text.match(/- Generated at:\s*(.+)/)?.[1]?.trim() || '';
  const lastSuccess = text.match(/- Last successful check:\s*(.+)/)?.[1]?.trim() || '';
  const nextRefresh = text.match(/- Next refresh \(target\):\s*(.+)/)?.[1]?.trim() || '';

  const hasMetadata = Boolean(generated && lastSuccess && nextRefresh && lastSuccess.toLowerCase() !== 'unknown');
  return {
    ok: hasMetadata,
    generated,
    lastSuccess,
    nextRefresh
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

  const smoke = run('npm', ['run', 'check:phasea-smoke']);
  const monitorRun = run('node', ['scripts/web-monitor.mjs']);
  const falseClaimGuard = run('node', [
    'scripts/jin-loop-validate-th-report.mjs',
    '--text',
    'เปลี่ยน: status OK แล้ว\nช่วยได้: ผ่านทุกอย่าง\nถัดไป: ปิดงาน\nหลักฐาน: ยังไม่มี'
  ]);

  const bridgeKpi = kpiFromBridgeSimulation();
  const monitorMeta = readMonitorMetadata();

  const staleHandling = monitorMeta.ok ? 'PASS (มี Last successful check + Next refresh)' : `FAIL (${monitorMeta.reason || 'metadata missing'})`;
  const recoveryTime = `${bridgeKpi.cooldownRecoveryMs} ms`;
  const falseClaimGuardResult = falseClaimGuard.code === 17 ? 'PASS (blocked by validator code 17)' : `FAIL (exit ${falseClaimGuard.code})`;

  const checks = [smoke, monitorRun, falseClaimGuard];
  const status = checks.every((x) => x.ok || x === falseClaimGuard) && falseClaimGuard.code === 17 ? 'PASS' : 'FAIL';

  const body = [
    '# Phase A KPI Baseline',
    '',
    `- Canonical context lock: #${canonicalContextId}`,
    `- Started at (UTC): ${startedAt}`,
    `- Overall: **${status}**`,
    '',
    '## KPI Snapshot (Initial)',
    '',
    `- Duplicate/noise block rate: **${bridgeKpi.duplicateBlockRate}%** (blocked=${bridgeKpi.duplicateBlocked ? 1 : 0}/1 duplicate attempt)`,
    `- False status claim guard: **${falseClaimGuardResult}**`,
    `- Stale handling visibility: **${staleHandling}**`,
    `- Recovery time (dedupe cooldown path): **${recoveryTime}**`,
    '',
    ...checks.map((x) => toSection(x)),
    'สรุป: เก็บ KPI baseline เริ่มต้นครบ 4 แกน (duplicate/noise, false-claim, stale handling, recovery time)'
  ].join('\n');

  const abs = path.resolve(evidencePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf8');

  console.log(`wrote ${evidencePath}`);
  console.log(`overall=${status}`);

  if (status !== 'PASS') process.exit(1);
}

main();
