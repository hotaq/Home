#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const targetUrl = process.env.TARGET_URL || 'https://hotaq.github.io/Home/';
const monitorPath = process.env.MONITOR_FILE || 'web/monitor-latest.md';
const dashboardDataPath = process.env.DASHBOARD_DATA_FILE || 'web/data.json';
const canonicalContextId = String(process.env.CANONICAL_CONTEXT_ID || '3');
const syntaxTargets = [
  'scripts/acp-bridge-core.mjs',
  'scripts/acp-bridge-smoke.mjs',
  'scripts/jin-loop-run.mjs',
  'scripts/jin-loop-validate-th-report.mjs',
  'scripts/web-monitor.mjs',
  'web/main.js'
];

function runNodeCheck(file) {
  const proc = spawnSync('node', ['--check', file], { encoding: 'utf8' });
  return {
    name: `node --check ${file}`,
    ok: proc.status === 0,
    detail: proc.status === 0 ? 'ok' : (proc.stderr || proc.stdout || 'syntax error').trim()
  };
}

async function checkHttp(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { method: 'GET' });
    const ms = Date.now() - started;
    return {
      name: `http ${url}`,
      ok: res.ok,
      detail: `status ${res.status} in ${ms}ms`
    };
  } catch (err) {
    const ms = Date.now() - started;
    return {
      name: `http ${url}`,
      ok: false,
      detail: `${String(err?.message || err)} in ${ms}ms`
    };
  }
}

function checkMonitorData(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    return {
      name: `data presence ${file}`,
      ok: false,
      detail: 'missing monitor file'
    };
  }

  const text = fs.readFileSync(abs, 'utf8').trim();
  const hasHeader = text.includes('## Web MVP Monitor');
  const hasSiteLine = /- Site:/i.test(text);
  const hasIssueProbe = /GitHub API \(issue probes\)/i.test(text);
  const nonEmpty = text.length > 40;

  const ok = hasHeader && hasSiteLine && hasIssueProbe && nonEmpty;
  return {
    name: `data presence ${file}`,
    ok,
    detail: ok
      ? `ok (${text.split('\n').length} lines)`
      : `invalid content (header=${hasHeader}, site=${hasSiteLine}, issues=${hasIssueProbe}, len=${text.length})`
  };
}

function checkCanonicalContextLock(dataFile, contextId) {
  const abs = path.resolve(dataFile);
  if (!fs.existsSync(abs)) {
    return {
      name: `canonical context lock ${dataFile}`,
      ok: false,
      detail: 'missing dashboard data file'
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const threads = Array.isArray(parsed.threads) ? parsed.threads : [];
    const expected = `/issues/${contextId}`;
    const hasCanonicalThread = threads.some((thread) => String(thread?.url || '').includes(expected));

    return {
      name: `canonical context lock ${dataFile}`,
      ok: hasCanonicalThread,
      detail: hasCanonicalThread
        ? `ok (found ${expected} in threads)`
        : `missing canonical thread ${expected}`
    };
  } catch (err) {
    return {
      name: `canonical context lock ${dataFile}`,
      ok: false,
      detail: `invalid json: ${String(err?.message || err)}`
    };
  }
}

function print(check) {
  console.log(`- ${check.ok ? 'OK' : 'FAIL'} | ${check.name} | ${check.detail}`);
}

async function main() {
  const checks = [];

  for (const file of syntaxTargets) {
    checks.push(runNodeCheck(file));
  }

  checks.push(await checkHttp(targetUrl));
  checks.push(checkMonitorData(monitorPath));
  checks.push(checkCanonicalContextLock(dashboardDataPath, canonicalContextId));

  console.log('Phase A smoke checks');
  for (const check of checks) print(check);

  const failed = checks.filter((c) => !c.ok);
  console.log(`Summary: ${checks.length - failed.length}/${checks.length} passed`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
