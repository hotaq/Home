#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createBridgeHandlers } from './acp-bridge-core.mjs';

const canonicalContextId = String(process.env.CANONICAL_CONTEXT_ID || '3');
const evidencePath = process.env.EVIDENCE_PATH || 'docs/prd/evidence/phaseb-controlled-rollout-round2.md';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toPercent(x, y) {
  if (!y) return '0%';
  return `${Math.round((x / y) * 100)}%`;
}

function runPhaseBRound2() {
  let nowMs = 1_700_000_010_000;

  const handlers = createBridgeHandlers({
    canonicalContextId,
    cooldownMs: 4_000,
    senderPolicy: { relayA: ['alice'] },
    inboundRateLimit: { windowMs: 30_000, maxEvents: 5 },
    inboundRolloutFlags: {
      defaultEnabled: false,
      bots: { relayA: true },
      senders: { alice: true },
      pairs: { 'relayA:alice': true }
    },
    retryPolicy: {
      enabled: true,
      maxAttempts: 2,
      baseDelayMs: 1_000,
      maxDelayMs: 4_000,
      jitterRatio: 0,
      retryableErrors: ['upstream-timeout', 'network-unreachable', 'rate-limited']
    },
    now: () => nowMs,
    random: () => 0.5
  });

  // Controlled change #1: tighter retry/backoff automation
  const retry1 = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 1,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-round2-retry-1' }
  });
  const retry2Blocked = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 3,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-round2-retry-limit' }
  });

  assert(retry1.ok && retry1.scheduledInMs === 1000, 'retry attempt 1 should schedule 1s');
  assert(retry2Blocked.ok === false && retry2Blocked.reason === 'retry-attempt-limit', 'retry attempt > max should be blocked');

  const retrySuccess = [retry1].filter((x) => x.ok).length;
  const retryAttempts = 2;

  // Controlled change #2: tighter inbound relay rollout by sender policy + feature flags
  const ackAlice = handlers.ack({
    contextId: canonicalContextId,
    senderId: 'alice',
    botId: 'relayA',
    source: 'bot-relay',
    payload: { text: 'round2-relay-allowed' }
  });

  let bobBlockedReason = 'unknown';
  try {
    handlers.ack({
      contextId: canonicalContextId,
      senderId: 'bob',
      botId: 'relayA',
      source: 'bot-relay',
      payload: { text: 'round2-relay-blocked' }
    });
  } catch (err) {
    bobBlockedReason = String(err.message || 'unknown');
  }

  let wrongContextBlocked = false;
  try {
    handlers.ack({
      contextId: '9',
      senderId: 'alice',
      botId: 'relayA',
      source: 'bot-relay',
      payload: { text: 'round2-wrong-context' }
    });
  } catch (err) {
    wrongContextBlocked = String(err.message || '').includes('context-lock-violation');
  }

  assert(ackAlice.ok === true, 'alice should pass tighter rollout + sender policy');
  const bobBlockedByPolicy = bobBlockedReason.includes('relay-rollout-disabled') || bobBlockedReason.includes('sender-policy-violation');
  assert(bobBlockedByPolicy, 'bob should be blocked by tighter rollout/sender policy');
  assert(wrongContextBlocked, 'canonical context lock must stay active');

  const trace = handlers._internal.traceLog;
  const retryTrace = trace.filter((x) => x.status === 'retry-plan');
  const inboundAckTrace = trace.filter((x) => x.status === 'ack');

  return {
    startedAt: new Date(nowMs).toISOString(),
    kpi1: {
      name: 'limited retry/backoff automation (tightened)',
      retryAttempts,
      retrySuccess,
      retryAcceptance: toPercent(retrySuccess, retryAttempts),
      retryBackoffScheduleMs: [retry1.scheduledInMs],
      attemptLimitBlocked: retry2Blocked.reason
    },
    kpi2: {
      name: 'inbound relay rollout by sender policy + feature flags (tightened)',
      allowedSender: ackAlice.envelope.meta.sender_id,
      blockedSenderReason: bobBlockedReason,
      inboundAckCount: inboundAckTrace.length,
      canonicalContextGuard: wrongContextBlocked ? 'PASS' : 'FAIL'
    },
    traceEntries: trace.length,
    retryTraceEntries: retryTrace.length
  };
}

function writeEvidence(result) {
  const body = [
    '# Phase B Controlled Rollout — Round 2',
    '',
    `- Canonical context lock: #${canonicalContextId}`,
    `- Generated at (UTC): ${new Date().toISOString()}`,
    '',
    '## Controlled change #1 — limited retry/backoff automation (tightened)',
    '',
    `- Retry acceptance (within tightened limits): **${result.kpi1.retryAcceptance}** (${result.kpi1.retrySuccess}/${result.kpi1.retryAttempts})`,
    `- Backoff schedule observed: **${result.kpi1.retryBackoffScheduleMs.join('ms, ')}ms**`,
    `- Attempt-limit guard: **${result.kpi1.attemptLimitBlocked}**`,
    '',
    '## Controlled change #2 — inbound relay rollout by sender policy + feature flags (tightened)',
    '',
    `- Allowed sender: **${result.kpi2.allowedSender}**`,
    `- Blocked sender evidence: **${result.kpi2.blockedSenderReason}**`,
    `- Inbound ACK accepted: **${result.kpi2.inboundAckCount}** event(s)`,
    `- Canonical context lock #3: **${result.kpi2.canonicalContextGuard}**`,
    '',
    '## Audit snapshot',
    '',
    `- Trace entries: ${result.traceEntries}`,
    `- Retry plan trace entries: ${result.retryTraceEntries}`,
    '',
    'สรุป: เดิน Phase B รอบ 2 แบบคุมความเสี่ยงเข้มขึ้น โดยเก็บ KPI หลังแต่ละ change ครบ และคง context lock #3'
  ].join('\n');

  const abs = path.resolve(evidencePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body + '\n', 'utf8');
  return abs;
}

function main() {
  const result = runPhaseBRound2();
  const out = writeEvidence(result);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

main();
