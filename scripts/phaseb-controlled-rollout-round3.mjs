#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createBridgeHandlers } from './acp-bridge-core.mjs';

const canonicalContextId = String(process.env.CANONICAL_CONTEXT_ID || '3');
const evidencePath = process.env.EVIDENCE_PATH || 'docs/prd/evidence/phaseb-controlled-rollout-round3.md';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toPercent(x, y) {
  if (!y) return '0%';
  return `${Math.round((x / y) * 100)}%`;
}

function runPhaseBRound3() {
  let nowMs = 1_700_000_020_000;

  const handlers = createBridgeHandlers({
    canonicalContextId,
    cooldownMs: 4_000,
    senderPolicy: { relayA: ['alice', 'bob', 'lockcheck'] },
    inboundRateLimit: { windowMs: 30_000, maxEvents: 2 },
    inboundRolloutFlags: {
      defaultEnabled: false,
      bots: { relayA: true },
      senders: { alice: true, bob: false, lockcheck: true },
      pairs: { 'relayA:alice': true, 'relayA:bob': true, 'relayA:lockcheck': true }
    },
    retryPolicy: {
      enabled: true,
      maxAttempts: 1,
      baseDelayMs: 1_000,
      maxDelayMs: 2_000,
      jitterRatio: 0,
      retryableErrors: ['upstream-timeout']
    },
    now: () => nowMs,
    random: () => 0.5
  });

  // Controlled change #1: strict retry scope (single-attempt + only timeout)
  const retryAllowed = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 1,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-round3-retry-allowed' }
  });

  const retryBlockedNonRetryable = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 1,
    errorCode: 'rate-limited',
    payload: { probe: 'phaseb-round3-retry-blocked-non-retryable' }
  });

  const retryBlockedAttempt = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 2,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-round3-retry-blocked-attempt' }
  });

  assert(retryAllowed.ok && retryAllowed.scheduledInMs === 1000, 'retry allowed should schedule 1s');
  assert(retryBlockedNonRetryable.ok === false && retryBlockedNonRetryable.reason === 'non-retryable-error', 'non-retryable code should be blocked');
  assert(retryBlockedAttempt.ok === false && retryBlockedAttempt.reason === 'retry-attempt-limit', 'attempt > max should be blocked');

  const retrySuccess = [retryAllowed].filter((x) => x.ok).length;
  const retryAttempts = 3;

  // Controlled change #2: sender rollout canary + rate-limit guard
  const ackAlice = handlers.ack({
    contextId: canonicalContextId,
    senderId: 'alice',
    botId: 'relayA',
    source: 'bot-relay',
    payload: { text: 'round3-relay-allowed-alice' }
  });

  const ackBob = handlers.ack({
    contextId: canonicalContextId,
    senderId: 'bob',
    botId: 'relayA',
    source: 'bot-relay',
    payload: { text: 'round3-relay-canary-bob-1' }
  });

  handlers.ack({
    contextId: canonicalContextId,
    senderId: 'bob',
    botId: 'relayA',
    source: 'bot-relay',
    payload: { text: 'round3-relay-canary-bob-2' }
  });

  nowMs += 1000;
  let bobRateLimitedReason = 'unknown';
  try {
    handlers.ack({
      contextId: canonicalContextId,
      senderId: 'bob',
      botId: 'relayA',
      source: 'bot-relay',
      payload: { text: 'round3-relay-bob-rate-limit-hit' }
    });
  } catch (err) {
    bobRateLimitedReason = String(err.message || 'unknown');
  }

  let wrongContextBlocked = false;
  try {
    handlers.ack({
      contextId: '99',
      senderId: 'lockcheck',
      botId: 'relayA',
      source: 'bot-relay',
      payload: { text: 'round3-wrong-context' }
    });
  } catch (err) {
    wrongContextBlocked = String(err.message || '').includes('context-lock-violation');
  }

  assert(ackAlice.ok === true, 'alice should pass');
  assert(ackBob.ok === true, 'bob canary should pass due to pair flag + policy');
  assert(bobRateLimitedReason.includes('sender-rate-limited'), 'bob should hit per-sender rate limit on 3rd inbound within window');
  assert(wrongContextBlocked, 'canonical context lock must stay active');

  const trace = handlers._internal.traceLog;
  const retryTrace = trace.filter((x) => x.status === 'retry-plan');
  const inboundAckTrace = trace.filter((x) => x.status === 'ack');

  return {
    kpi1: {
      name: 'strict retry/backoff scope',
      retryAttempts,
      retrySuccess,
      retryAcceptance: toPercent(retrySuccess, retryAttempts),
      retryBackoffScheduleMs: [retryAllowed.scheduledInMs],
      nonRetryableBlocked: retryBlockedNonRetryable.reason,
      attemptLimitBlocked: retryBlockedAttempt.reason
    },
    kpi2: {
      name: 'sender policy + feature flags canary with rate-limit guard',
      allowedSenders: [ackAlice.envelope.meta.sender_id, ackBob.envelope.meta.sender_id],
      blockedSenderReason: bobRateLimitedReason,
      inboundAckCount: inboundAckTrace.length,
      canonicalContextGuard: wrongContextBlocked ? 'PASS' : 'FAIL'
    },
    traceEntries: trace.length,
    retryTraceEntries: retryTrace.length
  };
}

function writeEvidence(result) {
  const body = [
    '# Phase B Controlled Rollout — Round 3',
    '',
    `- Canonical context lock: #${canonicalContextId}`,
    `- Generated at (UTC): ${new Date().toISOString()}`,
    '',
    '## Controlled change #1 — limited retry/backoff automation (strict scope)',
    '',
    `- Retry acceptance (strict policy): **${result.kpi1.retryAcceptance}** (${result.kpi1.retrySuccess}/${result.kpi1.retryAttempts})`,
    `- Backoff schedule observed: **${result.kpi1.retryBackoffScheduleMs.join('ms, ')}ms**`,
    `- Non-retryable guard: **${result.kpi1.nonRetryableBlocked}**`,
    `- Attempt-limit guard: **${result.kpi1.attemptLimitBlocked}**`,
    '',
    '## Controlled change #2 — inbound relay rollout by sender policy + feature flags (canary + guard)',
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
    'สรุป: เดิน Phase B รอบ 3 แบบ canary พร้อม guard แน่นขึ้น, เก็บ KPI หลังแต่ละ change ครบ และคง context lock #3'
  ].join('\n');

  const abs = path.resolve(evidencePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body + '\n', 'utf8');
  return abs;
}

function main() {
  const result = runPhaseBRound3();
  const out = writeEvidence(result);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

main();
