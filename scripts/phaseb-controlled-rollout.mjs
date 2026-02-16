#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createBridgeHandlers } from './acp-bridge-core.mjs';

const canonicalContextId = String(process.env.CANONICAL_CONTEXT_ID || '3');
const evidencePath = process.env.EVIDENCE_PATH || 'docs/prd/evidence/phaseb-controlled-rollout-round1.md';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toPercent(x, y) {
  if (!y) return '0%';
  return `${Math.round((x / y) * 100)}%`;
}

function runPhaseB() {
  let nowMs = 1_700_000_000_000;

  const handlers = createBridgeHandlers({
    canonicalContextId,
    cooldownMs: 4_000,
    senderPolicy: { relayA: ['alice', 'bob'] },
    inboundRateLimit: { windowMs: 30_000, maxEvents: 5 },
    inboundRolloutFlags: {
      defaultEnabled: false,
      bots: { relayA: true },
      senders: { alice: true },
      pairs: { 'relayA:alice': true, 'relayA:bob': false }
    },
    retryPolicy: {
      enabled: true,
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 8_000,
      jitterRatio: 0,
      retryableErrors: ['upstream-timeout', 'network-unreachable', 'rate-limited']
    },
    now: () => nowMs,
    random: () => 0.5
  });

  // Controlled change #1: limited retry/backoff automation
  const retry1 = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 1,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-retry-1' }
  });
  const retry2 = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 2,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-retry-2' }
  });
  const retryBlocked = handlers.planRetry({
    contextId: canonicalContextId,
    source: 'auto',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 4,
    errorCode: 'upstream-timeout',
    payload: { probe: 'phaseb-retry-limit' }
  });

  assert(retry1.ok && retry1.scheduledInMs === 1000, 'retry attempt 1 should schedule 1s');
  assert(retry2.ok && retry2.scheduledInMs === 2000, 'retry attempt 2 should schedule 2s');
  assert(retryBlocked.ok === false && retryBlocked.reason === 'retry-attempt-limit', 'retry attempt > max should be blocked');

  const retrySuccess = [retry1, retry2].filter((x) => x.ok).length;
  const retryAttempts = 3;

  // Controlled change #2: inbound relay rollout by sender policy + feature flags
  const ackAlice = handlers.ack({
    contextId: canonicalContextId,
    senderId: 'alice',
    botId: 'relayA',
    source: 'bot-relay',
    payload: { text: 'relay-allowed' }
  });

  let bobBlockedReason = 'unknown';
  try {
    handlers.ack({
      contextId: canonicalContextId,
      senderId: 'bob',
      botId: 'relayA',
      source: 'bot-relay',
      payload: { text: 'relay-blocked' }
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
      payload: { text: 'wrong-context' }
    });
  } catch (err) {
    wrongContextBlocked = String(err.message || '').includes('context-lock-violation');
  }

  assert(ackAlice.ok === true, 'alice should pass rollout + sender policy');
  assert(bobBlockedReason.includes('relay-rollout-disabled'), 'bob should be blocked by rollout feature flag');
  assert(wrongContextBlocked, 'canonical context lock must stay active');

  const trace = handlers._internal.traceLog;
  const retryTrace = trace.filter((x) => x.status === 'retry-plan');
  const inboundAckTrace = trace.filter((x) => x.status === 'ack');

  return {
    startedAt: new Date(nowMs).toISOString(),
    kpi1: {
      name: 'limited retry/backoff automation',
      retryAttempts,
      retrySuccess,
      retryAcceptance: toPercent(retrySuccess, retryAttempts),
      retryBackoffScheduleMs: [retry1.scheduledInMs, retry2.scheduledInMs],
      attemptLimitBlocked: retryBlocked.reason
    },
    kpi2: {
      name: 'inbound relay rollout by sender policy + feature flags',
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
    '# Phase B Controlled Rollout — Round 1',
    '',
    `- Canonical context lock: #${canonicalContextId}`,
    `- Generated at (UTC): ${new Date().toISOString()}`,
    '',
    '## Controlled change #1 — limited retry/backoff automation',
    '',
    `- Retry acceptance (within limits): **${result.kpi1.retryAcceptance}** (${result.kpi1.retrySuccess}/${result.kpi1.retryAttempts})`,
    `- Backoff schedule observed: **${result.kpi1.retryBackoffScheduleMs.join('ms, ')}ms**`,
    `- Attempt-limit guard: **${result.kpi1.attemptLimitBlocked}**`,
    '',
    '## Controlled change #2 — inbound relay rollout by sender policy + feature flags',
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
    'สรุป: เริ่ม Phase B แบบ controlled automation แล้ว โดยเก็บ KPI หลังแต่ละ change ครบ และยังคง context lock #3'
  ].join('\n');

  const abs = path.resolve(evidencePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body + '\n', 'utf8');
  return abs;
}

function main() {
  const result = runPhaseB();
  const out = writeEvidence(result);
  console.log(`wrote ${path.relative(process.cwd(), out)}`);
}

main();
