import { createBridgeHandlers } from './acp-bridge-core.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  let nowMs = 1_700_000_000_000;
  const handlers = createBridgeHandlers({
    cooldownMs: 5_000,
    canonicalContextId: '3',
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

  const mapped = handlers.error({
    contextId: '3',
    error: new Error('network timeout while fetching')
  });
  assert(mapped.mappedError === 'upstream-timeout', 'error mapping should classify timeout');

  let contextGuardOk = false;
  try {
    handlers.ack({ contextId: '4' });
  } catch (err) {
    contextGuardOk = String(err.message || '').includes('context-lock-violation');
  }
  assert(contextGuardOk, 'context lock should reject non-canonical context id');

  console.log('ACP bridge smoke: PASS');
  console.log(`event(send)=${firstSend.envelope.event_id}`);
  console.log(`event(error)=${mapped.envelope.event_id}`);
}

run();
