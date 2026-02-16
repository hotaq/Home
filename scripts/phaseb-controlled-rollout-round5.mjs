#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createBridgeHandlers } from './acp-bridge-core.mjs';

const canonicalContextId = String(process.env.CANONICAL_CONTEXT_ID || '3');
const evidencePath = process.env.EVIDENCE_PATH || 'docs/prd/evidence/phaseb-controlled-rollout-round5.md';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toPercent(x, y) {
  if (!y) return '0%';
  return `${Math.round((x / y) * 100)}%`;
}

function runPhaseBRound5() {
  let nowMs = 1_700_000_040_000;

  const handlers = createBridgeHandlers({
    canonicalContextId,
    cooldownMs: 4_000,
    senderPolicy: { relayA: ['lockcheck'] },
    inboundRateLimit: { windowMs: 30_000, maxEvents: 3 },
    inboundRolloutFlags: {
      defaultEnabled: false,
      bots: { relayA: true },
      senders: { lockcheck: true, alice: false, bob: false },
      pairs: { 'relayA:lockcheck': true, 'relayA:alice': false, 'relayA:bob': false }
    },
    retryPolicy: {
      enabled: true,
      maxAttempts: 1,
      baseDelayMs: 1000,
      maxDelayMs: 1000,
      jitterRatio: 0,
      retryableErrors: ['upstream-timeout']
    },
    now: () => nowMs,
    random: () => 0.5
  });

  // Controlled change #1: tighten retry/backoff automation further
  const retryAllowed1 = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'lockcheck',
    botId: 'relayA',
    attempt: 1,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-round5-retry-allowed-1' }
  });

  const retryBlockedAttempt = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'lockcheck',
    botId: 'relayA',
    attempt: 2,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-round5-retry-blocked-attempt' }
  });

  const retryBlockedNonRetryable = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'lockcheck',
    botId: 'relayA',
    attempt: 1,
    errorCode: 'network-unreachable',
    payload: { probe: 'phaseb-round5-retry-blocked-non-retryable' }
  });

  assert(retryAllowed1.ok && retryAllowed1.scheduledInMs === 1000, 'retry attempt 1 should schedule 1000ms');
  assert(retryBlockedAttempt.ok === false && retryBlockedAttempt.reason === 'retry-attempt-limit', 'attempt > max should be blocked');
  assert(retryBlockedNonRetryable.ok === false && retryBlockedNonRetryable.reason === 'non-retryable-error', 'non-retryable code should be blocked');

  const retrySuccess = [retryAllowed1].filter((x) => x.ok).length;
  const retryAttempts = 3;

  // Controlled change #2: policy-first inbound rollout by sender flags
  const ackLockcheck = handlers.ack({
    contextId: canonicalContextId,
    senderId: 'lockcheck',
    botId: 'relayA',
    source: 'bot-relay',
    payload: { text: 'round5-relay-allowed-lockcheck' }
  });

  let aliceBlockedReason = 'unknown';
  try {
    handlers.ack({
      contextId: canonicalContextId,
      senderId: 'alice',
      botId: 'relayA',
      source: 'bot-relay',
      payload: { text: 'round5-relay-blocked-alice' }
    });
  } catch (err) {
    aliceBlockedReason = String(err.message || 'unknown');
  }

  let wrongContextBlocked = false;
  try {
    handlers.ack({
      contextId: '42',
      senderId: 'lockcheck',
      botId: 'relayA',
      source: 'bot-relay',
      payload: { text: 'round5-wrong-context' }
    });
  } catch (err) {
    wrongContextBlocked = String(err.message || '').includes('context-lock-violation');
  }

  assert(ackLockcheck.ok === true, 'lockcheck should pass');
  assert(aliceBlockedReason.includes('relay-rollout-disabled') || aliceBlockedReason.includes('sender-policy-violation'), 'alice should be blocked by rollout/policy');
  assert(wrongContextBlocked, 'canonical context lock must stay active');

  const trace = handlers._internal.traceLog;
  const retryTrace = trace.filter((x) => x.status === 'retry-plan');
  const inboundAckTrace = trace.filter((x) => x.status === 'ack');

  return {
    kpi1: {
      name: 'limited retry/backoff automation (tight cap + single retryable error)',
      retryAttempts,
      retrySuccess,
      retryAcceptance: toPercent(retrySuccess, retryAttempts),
      retryBackoffScheduleMs: [retryAllowed1.scheduledInMs],
      nonRetryableBlocked: retryBlockedNonRetryable.reason,
      attemptLimitBlocked: retryBlockedAttempt.reason
    },
    kpi2: {
      name: 'inbound relay rollout by sender policy + feature flags (lockcheck-only)',
      allowedSenders: [ackLockcheck.envelope.meta.sender_id],
      blockedSenderReason: aliceBlockedReason,
      inboundAckCount: inboundAckTrace.length,
      canonicalContextGuard: wrongContextBlocked ? 'PASS' : 'FAIL'
    },
    traceEntries: trace.length,
    retryTraceEntries: retryTrace.length
  };
}

function writeEvidence(result) {
  const body = [
    '# Phase B Controlled Rollout — Round 5',
    '',
    `- Canonical context lock: #${canonicalContextId}`,
    `- Generated at (UTC): ${new Date().toISOString()}`,
    '',
    '## Controlled change #1 — limited retry/backoff automation (tightened cap + retryable set)',
    '',
    `- Retry acceptance (tight cap): **${result.kpi1.retryAcceptance}** (${result.kpi1.retrySuccess}/${result.kpi1.retryAttempts})`,
    `- Backoff schedule observed: **${result.kpi1.retryBackoffScheduleMs.join('ms, ')}ms**`,
    `- Non-retryable guard: **${result.kpi1.nonRetryableBlocked}**`,
    `- Attempt-limit guard: **${result.kpi1.attemptLimitBlocked}**`,
    '',
    '## Controlled change #2 — inbound relay rollout by sender policy + feature flags (lockcheck-only)',
    '',
    `- Allowed senders: **${result.kpi2.allowedSenders.join(', ')}**`,
    `- Blocked sender evidence: **${result.kpi2.blockedSenderReason}**`,
    `- Inbound ACK accepted: **${result.kpi2.inboundAckCount}** event(s)`,
    `- Canonical context lock #3: **${result.kpi2.canonicalContextGuard}**`,
    '',
    '## Audit snapshot',
    '',
    `- Trace entries: ${result.traceEntries}`,
    `- Retry plan trace entries: ${result.retryTraceEntries}`,
    '',
    'สรุป: เดิน Phase B รอบ 5 แบบคุมเข้ม (lockcheck-only + retry แบบจำกัดขั้น), เก็บ KPI หลังทุก controlled change และคง context lock #3'
  ].join('\n');

  const abs = path.resolve(evidencePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body + '\n', 'utf8');
  return abs;
}

function main() {
  const result = runPhaseBRound5();
  const out = writeEvidence(result);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

main();
