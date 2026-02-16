#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createBridgeHandlers } from './acp-bridge-core.mjs';

const canonicalContextId = String(process.env.CANONICAL_CONTEXT_ID || '3');
const evidencePath = process.env.EVIDENCE_PATH || 'docs/prd/evidence/phaseb-controlled-rollout-round7.md';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toPercent(x, y) {
  if (!y) return '0%';
  return `${Math.round((x / y) * 100)}%`;
}

function runPhaseBRound7() {
  let nowMs = 1_700_000_060_000;

  const handlers = createBridgeHandlers({
    canonicalContextId,
    cooldownMs: 4_000,
    senderPolicy: { relayA: ['lockcheck', 'alice', 'bob'] },
    inboundRateLimit: { windowMs: 30_000, maxEvents: 4 },
    inboundRolloutFlags: {
      defaultEnabled: false,
      bots: { relayA: true },
      senders: { lockcheck: true, alice: true, bob: true, mallory: false },
      pairs: {
        'relayA:lockcheck': true,
        'relayA:alice': true,
        'relayA:bob': true,
        'relayA:mallory': false
      }
    },
    retryPolicy: {
      enabled: true,
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 2000,
      jitterRatio: 0,
      retryableErrors: ['upstream-timeout', 'rate-limited']
    },
    now: () => nowMs,
    random: () => 0.5
  });

  // Controlled change #1: limited retry/backoff (3-step, capped)
  const retryAllowed1 = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'lockcheck',
    botId: 'relayA',
    attempt: 1,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-round7-retry-allowed-1' }
  });

  const retryAllowed2 = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'lockcheck',
    botId: 'relayA',
    attempt: 2,
    errorCode: 'rate-limited',
    payload: { probe: 'phaseb-round7-retry-allowed-2' }
  });

  const retryAllowed3 = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'lockcheck',
    botId: 'relayA',
    attempt: 3,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-round7-retry-allowed-3' }
  });

  const retryBlockedAttempt = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'lockcheck',
    botId: 'relayA',
    attempt: 4,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-round7-retry-blocked-attempt' }
  });

  const retryBlockedNonRetryable = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'lockcheck',
    botId: 'relayA',
    attempt: 1,
    errorCode: 'network-unreachable',
    payload: { probe: 'phaseb-round7-retry-blocked-non-retryable' }
  });

  assert(retryAllowed1.ok && retryAllowed1.scheduledInMs === 1000, 'retry attempt 1 should schedule 1000ms');
  assert(retryAllowed2.ok && retryAllowed2.scheduledInMs === 2000, 'retry attempt 2 should schedule 2000ms');
  assert(retryAllowed3.ok && retryAllowed3.scheduledInMs === 2000, 'retry attempt 3 should stay capped at 2000ms');
  assert(retryBlockedAttempt.ok === false && retryBlockedAttempt.reason === 'retry-attempt-limit', 'attempt > max should be blocked');
  assert(retryBlockedNonRetryable.ok === false && retryBlockedNonRetryable.reason === 'non-retryable-error', 'non-retryable code should be blocked');

  const retrySuccess = [retryAllowed1, retryAllowed2, retryAllowed3].filter((x) => x.ok).length;
  const retryAttempts = 5;

  // Controlled change #2: inbound relay rollout by sender policy + flags (bob canary)
  const ackLockcheck = handlers.ack({
    contextId: canonicalContextId,
    senderId: 'lockcheck',
    botId: 'relayA',
    source: 'bot-relay',
    payload: { text: 'round7-relay-allowed-lockcheck' }
  });

  nowMs += 5_000;

  const ackAlice = handlers.ack({
    contextId: canonicalContextId,
    senderId: 'alice',
    botId: 'relayA',
    source: 'bot-relay',
    payload: { text: 'round7-relay-allowed-alice' }
  });

  nowMs += 5_000;

  const ackBob = handlers.ack({
    contextId: canonicalContextId,
    senderId: 'bob',
    botId: 'relayA',
    source: 'bot-relay',
    payload: { text: 'round7-relay-allowed-bob' }
  });

  let malloryBlockedReason = 'unknown';
  try {
    handlers.ack({
      contextId: canonicalContextId,
      senderId: 'mallory',
      botId: 'relayA',
      source: 'bot-relay',
      payload: { text: 'round7-relay-blocked-mallory' }
    });
  } catch (err) {
    malloryBlockedReason = String(err.message || 'unknown');
  }

  let wrongContextBlocked = false;
  try {
    handlers.ack({
      contextId: '42',
      senderId: 'bob',
      botId: 'relayA',
      source: 'bot-relay',
      payload: { text: 'round7-wrong-context' }
    });
  } catch (err) {
    wrongContextBlocked = String(err.message || '').includes('context-lock-violation');
  }

  assert(ackLockcheck.ok === true, 'lockcheck should pass');
  assert(ackAlice.ok === true, 'alice should pass');
  assert(ackBob.ok === true, 'bob should pass in controlled canary expansion');
  assert(malloryBlockedReason.includes('relay-rollout-disabled') || malloryBlockedReason.includes('sender-policy-violation'), 'mallory should be blocked by rollout/policy');
  assert(wrongContextBlocked, 'canonical context lock must stay active');

  const trace = handlers._internal.traceLog;
  const retryTrace = trace.filter((x) => x.status === 'retry-plan');
  const inboundAckTrace = trace.filter((x) => x.status === 'ack');

  return {
    kpi1: {
      name: 'limited retry/backoff automation (3-step capped schedule)',
      retryAttempts,
      retrySuccess,
      retryAcceptance: toPercent(retrySuccess, retryAttempts),
      retryBackoffScheduleMs: [retryAllowed1.scheduledInMs, retryAllowed2.scheduledInMs, retryAllowed3.scheduledInMs],
      nonRetryableBlocked: retryBlockedNonRetryable.reason,
      attemptLimitBlocked: retryBlockedAttempt.reason
    },
    kpi2: {
      name: 'inbound relay rollout by sender policy + feature flags (bob canary)',
      allowedSenders: [ackLockcheck.envelope.meta.sender_id, ackAlice.envelope.meta.sender_id, ackBob.envelope.meta.sender_id],
      blockedSenderReason: malloryBlockedReason,
      inboundAckCount: inboundAckTrace.length,
      canonicalContextGuard: wrongContextBlocked ? 'PASS' : 'FAIL'
    },
    traceEntries: trace.length,
    retryTraceEntries: retryTrace.length
  };
}

function writeEvidence(result) {
  const body = [
    '# Phase B Controlled Rollout — Round 7',
    '',
    `- Canonical context lock: #${canonicalContextId}`,
    `- Generated at (UTC): ${new Date().toISOString()}`,
    '',
    '## Controlled change #1 — limited retry/backoff automation (3-step capped schedule)',
    '',
    `- Retry acceptance (capped 3-step): **${result.kpi1.retryAcceptance}** (${result.kpi1.retrySuccess}/${result.kpi1.retryAttempts})`,
    `- Backoff schedule observed: **${result.kpi1.retryBackoffScheduleMs.join('ms, ')}ms**`,
    `- Non-retryable guard: **${result.kpi1.nonRetryableBlocked}**`,
    `- Attempt-limit guard: **${result.kpi1.attemptLimitBlocked}**`,
    '',
    '## Controlled change #2 — inbound relay rollout by sender policy + feature flags (bob canary)',
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
    'สรุป: เดิน Phase B รอบ 7 แบบขยาย canary อย่างคุมความเสี่ยง (เพิ่ม bob พร้อมล็อก policy/flags), retry/backoff ยัง capped และคง context lock #3'
  ].join('\n');

  const abs = path.resolve(evidencePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body + '\n', 'utf8');
  return abs;
}

function main() {
  const result = runPhaseBRound7();
  const out = writeEvidence(result);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

main();
