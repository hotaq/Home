#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createBridgeHandlers } from './acp-bridge-core.mjs';

const canonicalContextId = String(process.env.CANONICAL_CONTEXT_ID || '3');
const evidencePath = process.env.EVIDENCE_PATH || 'docs/prd/evidence/phaseb-controlled-rollout-round4.md';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toPercent(x, y) {
  if (!y) return '0%';
  return `${Math.round((x / y) * 100)}%`;
}

function runPhaseBRound4() {
  let nowMs = 1_700_000_030_000;

  const handlers = createBridgeHandlers({
    canonicalContextId,
    cooldownMs: 4_000,
    senderPolicy: { relayA: ['alice', 'lockcheck'] },
    inboundRateLimit: { windowMs: 30_000, maxEvents: 5 },
    inboundRolloutFlags: {
      defaultEnabled: false,
      bots: { relayA: true },
      senders: { alice: true, bob: false, lockcheck: true },
      pairs: { 'relayA:alice': true, 'relayA:bob': false, 'relayA:lockcheck': true }
    },
    retryPolicy: {
      enabled: true,
      maxAttempts: 2,
      baseDelayMs: 800,
      maxDelayMs: 1600,
      jitterRatio: 0,
      retryableErrors: ['upstream-timeout', 'network-unreachable']
    },
    now: () => nowMs,
    random: () => 0.5
  });

  // Controlled change #1: keep retry/backoff narrow with capped delay
  const retryAllowed1 = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 1,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-round4-retry-allowed-1' }
  });

  const retryAllowed2 = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 2,
    errorCode: 'network-unreachable',
    payload: { probe: 'phaseb-round4-retry-allowed-2' }
  });

  const retryBlockedAttempt = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 3,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-round4-retry-blocked-attempt' }
  });

  const retryBlockedNonRetryable = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 1,
    errorCode: 'rate-limited',
    payload: { probe: 'phaseb-round4-retry-blocked-non-retryable' }
  });

  assert(retryAllowed1.ok && retryAllowed1.scheduledInMs === 800, 'retry attempt 1 should schedule 800ms');
  assert(retryAllowed2.ok && retryAllowed2.scheduledInMs === 1600, 'retry attempt 2 should cap at 1600ms');
  assert(retryBlockedAttempt.ok === false && retryBlockedAttempt.reason === 'retry-attempt-limit', 'attempt > max should be blocked');
  assert(retryBlockedNonRetryable.ok === false && retryBlockedNonRetryable.reason === 'non-retryable-error', 'non-retryable code should be blocked');

  const retrySuccess = [retryAllowed1, retryAllowed2].filter((x) => x.ok).length;
  const retryAttempts = 4;

  // Controlled change #2: rollout by sender policy + feature flags with guardrails
  const ackAlice = handlers.ack({
    contextId: canonicalContextId,
    senderId: 'alice',
    botId: 'relayA',
    source: 'bot-relay',
    payload: { text: 'round4-relay-allowed-alice' }
  });

  let bobBlockedReason = 'unknown';
  try {
    handlers.ack({
      contextId: canonicalContextId,
      senderId: 'bob',
      botId: 'relayA',
      source: 'bot-relay',
      payload: { text: 'round4-relay-blocked-bob' }
    });
  } catch (err) {
    bobBlockedReason = String(err.message || 'unknown');
  }

  const ackLockcheck = handlers.ack({
    contextId: canonicalContextId,
    senderId: 'lockcheck',
    botId: 'relayA',
    source: 'bot-relay',
    payload: { text: 'round4-relay-allowed-lockcheck' }
  });

  let wrongContextBlocked = false;
  try {
    handlers.ack({
      contextId: '42',
      senderId: 'lockcheck',
      botId: 'relayA',
      source: 'bot-relay',
      payload: { text: 'round4-wrong-context' }
    });
  } catch (err) {
    wrongContextBlocked = String(err.message || '').includes('context-lock-violation');
  }

  assert(ackAlice.ok === true, 'alice should pass');
  assert(ackLockcheck.ok === true, 'lockcheck should pass');
  assert(bobBlockedReason.includes('relay-rollout-disabled') || bobBlockedReason.includes('sender-policy-violation'), 'bob should be blocked by rollout/policy');
  assert(wrongContextBlocked, 'canonical context lock must stay active');

  const trace = handlers._internal.traceLog;
  const retryTrace = trace.filter((x) => x.status === 'retry-plan');
  const inboundAckTrace = trace.filter((x) => x.status === 'ack');

  return {
    kpi1: {
      name: 'limited retry/backoff automation (capped + strict errors)',
      retryAttempts,
      retrySuccess,
      retryAcceptance: toPercent(retrySuccess, retryAttempts),
      retryBackoffScheduleMs: [retryAllowed1.scheduledInMs, retryAllowed2.scheduledInMs],
      nonRetryableBlocked: retryBlockedNonRetryable.reason,
      attemptLimitBlocked: retryBlockedAttempt.reason
    },
    kpi2: {
      name: 'inbound relay rollout by sender policy + feature flags (policy-first)',
      allowedSenders: [ackAlice.envelope.meta.sender_id, ackLockcheck.envelope.meta.sender_id],
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
    '# Phase B Controlled Rollout — Round 4',
    '',
    `- Canonical context lock: #${canonicalContextId}`,
    `- Generated at (UTC): ${new Date().toISOString()}`,
    '',
    '## Controlled change #1 — limited retry/backoff automation (capped + strict retryable set)',
    '',
    `- Retry acceptance (strict + capped): **${result.kpi1.retryAcceptance}** (${result.kpi1.retrySuccess}/${result.kpi1.retryAttempts})`,
    `- Backoff schedule observed: **${result.kpi1.retryBackoffScheduleMs.join('ms, ')}ms**`,
    `- Non-retryable guard: **${result.kpi1.nonRetryableBlocked}**`,
    `- Attempt-limit guard: **${result.kpi1.attemptLimitBlocked}**`,
    '',
    '## Controlled change #2 — inbound relay rollout by sender policy + feature flags (policy-first)',
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
    'สรุป: เดิน Phase B รอบ 4 แบบ policy-first พร้อม retry แบบจำกัดและ capped backoff, เก็บ KPI หลังทุก controlled change และคง context lock #3'
  ].join('\n');

  const abs = path.resolve(evidencePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body + '\n', 'utf8');
  return abs;
}

function main() {
  const result = runPhaseBRound4();
  const out = writeEvidence(result);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

main();
