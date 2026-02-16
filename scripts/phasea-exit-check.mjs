#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const canonicalContextId = String(process.env.CANONICAL_CONTEXT_ID || '3');
const evidencePath = process.env.EVIDENCE_PATH || 'docs/prd/evidence/phasea-exit-check.md';

function run(command, args) {
  const proc = spawnSync(command, args, { encoding: 'utf8' });
  return {
    command: [command, ...args].join(' '),
    code: proc.status ?? 1,
    ok: proc.status === 0,
    output: [proc.stdout, proc.stderr].filter(Boolean).join('').trim() || '(no output)'
  };
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(path.resolve(filePath), 'utf8');
  } catch {
    return '';
  }
}

function parseKpiBaseline(md) {
  const duplicateRate = md.match(/Duplicate\/noise block rate:\s*\*\*(\d+)%\*\*/i)?.[1];
  const falseClaim = md.match(/False status claim guard:\s*\*\*([^*]+)\*\*/i)?.[1]?.trim();
  const staleHandling = md.match(/Stale handling visibility:\s*\*\*([^*]+)\*\*/i)?.[1]?.trim();
  return {
    duplicateRate: duplicateRate ? Number(duplicateRate) : null,
    falseClaim,
    staleHandling
  };
}

function parseMonitor(md) {
  const sourceLine = md.match(/- Source:\s*(.+)/i)?.[1]?.trim() || null;
  const generatedAt = md.match(/- Generated at:\s*(.+)/)?.[1]?.trim() || null;
  const lastSuccess = md.match(/- Last successful check:\s*(.+)/)?.[1]?.trim() || null;
  const nextRefresh = md.match(/- Next refresh \(target\):\s*(.+)/)?.[1]?.trim() || null;
  return { sourceLine, generatedAt, lastSuccess, nextRefresh };
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
  const dryrun1 = run('npm', ['run', 'check:phasea-dryrun1']);
  const dryrun2 = run('npm', ['run', 'check:phasea-dryrun2']);
  const kpi = run('npm', ['run', 'check:phasea-kpi']);

  const kpiMd = readFileSafe('docs/prd/evidence/phasea-kpi-baseline.md');
  const monitorMd = readFileSafe('web/monitor-latest.md');
  const kpiParsed = parseKpiBaseline(kpiMd);
  const monitor = parseMonitor(monitorMd);

  const criterionDuplicate = kpiParsed.duplicateRate === 100;
  const criterionFalseClaim = Boolean(kpiParsed.falseClaim && /pass/i.test(kpiParsed.falseClaim));
  const criterionMonitor = Boolean(monitor.generatedAt && monitor.lastSuccess && monitor.nextRefresh && monitor.lastSuccess.toLowerCase() !== 'unknown');
  const criterionConsistency = smoke.ok && dryrun1.ok && dryrun2.ok;

  const criteria = [
    { name: 'ไม่มี duplicate report ที่สำคัญ', pass: criterionDuplicate, note: `duplicate/noise block rate=${kpiParsed.duplicateRate ?? 'n/a'}%` },
    { name: 'false claim = 0', pass: criterionFalseClaim, note: `false-claim guard=${kpiParsed.falseClaim || 'n/a'}` },
    { name: 'monitor แสดง source+age ครบ', pass: criterionMonitor, note: `generated=${monitor.generatedAt || 'n/a'} | last_success=${monitor.lastSuccess || 'n/a'} | next_refresh=${monitor.nextRefresh || 'n/a'}` },
    { name: 'owner เห็นสถานะ ACP บนเว็บได้สม่ำเสมอ', pass: criterionConsistency, note: `smoke=${smoke.code} dryrun1=${dryrun1.code} dryrun2=${dryrun2.code}` }
  ];

  const passCount = criteria.filter((x) => x.pass).length;
  const overall = passCount === criteria.length ? 'PASS' : 'FAIL';

  const checks = [smoke, dryrun1, dryrun2, kpi];
  const body = [
    '# Phase A Exit Check',
    '',
    `- Canonical context lock: #${canonicalContextId}`,
    `- Started at (UTC): ${startedAt}`,
    `- Overall: **${overall}** (${passCount}/${criteria.length})`,
    '',
    '## Exit Criteria',
    '',
    ...criteria.map((c) => `- ${c.pass ? '✅' : '❌'} ${c.name} — ${c.note}`),
    '',
    ...checks.map((x) => toSection(x)),
    'สรุป: exit criteria ถูกประเมินจากหลักฐาน dry-run + smoke + KPI baseline โดยยึด canonical context #3'
  ].join('\n');

  const abs = path.resolve(evidencePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, 'utf8');

  console.log(`wrote ${evidencePath}`);
  console.log(`overall=${overall}`);

  if (overall !== 'PASS') process.exit(1);
}

main();
