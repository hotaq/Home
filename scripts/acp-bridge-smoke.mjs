import { createBridgeHandlers } from './acp-bridge-core.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  let nowMs = 1_700_000_000_000;
  const handlers = createBridgeHandlers({
    cooldownMs: 5_000,
    canonicalContextId: '3',
    senderPolicy: {
      relayA: ['alice']
    },
    inboundRateLimit: {
      windowMs: 10_000,
      maxEvents: 2
    },
    now: () => nowMs
  });

  const firstSend = handlers.send({
    contextId: '3',
    source: 'manual',
    payload: { text: 'phase-a check' }
  });
  assert(firstSend.ok === true, 'first send should pass');

  const duplicateSend = handlers.send({
    contextId: '3',
    source: 'manual',
    payload: { text: 'phase-a check' }
  });
  assert(duplicateSend.ok === false, 'duplicate send should be blocked by cooldown');

  nowMs += 6_000;
  const afterCooldown = handlers.send({
    contextId: '3',
    source: 'manual',
    payload: { text: 'phase-a check' }
  });
  assert(afterCooldown.ok === true, 'send after cooldown should pass');

  const ackAllowed = handlers.ack({
    contextId: '3',
    senderId: 'alice',
    botId: 'relayA',
    payload: { text: 'ok' }
  });
  assert(ackAllowed.ok === true, 'allowed sender should pass sender policy');

  let senderPolicyGuardOk = false;
  try {
    handlers.ack({
      contextId: '3',
      senderId: 'mallory',
      botId: 'relayA',
      payload: { text: 'intrusion' }
    });
  } catch (err) {
    senderPolicyGuardOk = String(err.message || '').includes('sender-policy-violation');
  }
  assert(senderPolicyGuardOk, 'sender policy should reject unauthorized sender');

  const mapped = handlers.error({
    contextId: '3',
    senderId: 'alice',
    botId: 'relayA',
    error: new Error('network timeout while fetching')
  });
  assert(mapped.mappedError === 'upstream-timeout', 'error mapping should classify timeout');

  let rateLimitGuardOk = false;
  try {
    handlers.retry({
      contextId: '3',
      senderId: 'alice',
      botId: 'relayA',
      attempt: 2,
      payload: { reason: 'retry-too-fast' }
    });
  } catch (err) {
    rateLimitGuardOk = String(err.message || '').includes('sender-rate-limited');
  }
  assert(rateLimitGuardOk, 'rate limit should reject excessive inbound events');

  nowMs += 11_000;
  const retryAfterWindow = handlers.retry({
    contextId: '3',
    senderId: 'alice',
    botId: 'relayA',
    attempt: 3,
    payload: { reason: 'retry-after-window' }
  });
  assert(retryAfterWindow.ok === true, 'retry should pass after rate-limit window reset');

  let contextGuardOk = false;
  try {
    handlers.ack({ contextId: '4', senderId: 'alice', botId: 'relayA' });
  } catch (err) {
    contextGuardOk = String(err.message || '').includes('context-lock-violation');
  }
  assert(contextGuardOk, 'context lock should reject non-canonical context id');

  assert(handlers._internal.traceLog.length >= 4, 'trace log should capture inbound/outbound events');

  console.log('ACP bridge smoke: PASS');
  console.log(`event(send)=${firstSend.envelope.event_id}`);
  console.log(`event(error)=${mapped.envelope.event_id}`);
  console.log(`trace(entries)=${handlers._internal.traceLog.length}`);
}

run();
