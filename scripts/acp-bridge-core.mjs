import crypto from 'node:crypto';

const DEFAULT_COOLDOWN_MS = 30_000;
const CANONICAL_CONTEXT_ID = '3';

export function mapBridgeError(err) {
  const message = String(err?.message || err || '').toLowerCase();

  if (!message) return 'unknown-error';
  if (message.includes('timeout') || message.includes('abort')) return 'upstream-timeout';
  if (message.includes('network') || message.includes('fetch')) return 'network-unreachable';
  if (message.includes('unauthorized') || message.includes('401')) return 'auth-failed';
  if (message.includes('forbidden') || message.includes('403')) return 'permission-denied';
  if (message.includes('not found') || message.includes('404')) return 'resource-not-found';
  if (message.includes('rate limit') || message.includes('429')) return 'rate-limited';
  if (message.includes('validation') || message.includes('invalid')) return 'invalid-input';

  return 'unknown-error';
}

function randomEventId() {
  return crypto.randomUUID();
}

function isoNow(nowFn = Date.now) {
  return new Date(nowFn()).toISOString();
}

function stablePayloadHash(payload) {
  const raw = JSON.stringify(payload ?? null);
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function createEventEnvelope({
  eventId = randomEventId(),
  contextId,
  status,
  source,
  payload,
  updatedAt = isoNow(),
  meta = {}
}) {
  if (!contextId) throw new Error('context_id is required');
  if (!status) throw new Error('status is required');
  if (!source) throw new Error('source is required');

  return {
    event_id: eventId,
    context_id: String(contextId),
    status,
    source,
    updated_at: updatedAt,
    payload: payload ?? null,
    meta
  };
}

export function assertCanonicalContext(contextId, canonicalContextId = CANONICAL_CONTEXT_ID) {
  const actual = String(contextId || '');
  const expected = String(canonicalContextId);
  if (actual !== expected) {
    throw new Error(`context-lock-violation: expected #${expected} but got #${actual || 'n/a'}`);
  }
}

export function createBridgeHandlers({
  cooldownMs = DEFAULT_COOLDOWN_MS,
  canonicalContextId = CANONICAL_CONTEXT_ID,
  now = Date.now
} = {}) {
  const seenByKey = new Map();

  function dedupeKey({ contextId, source, status, payload }) {
    return `${contextId}::${source}::${status}::${stablePayloadHash(payload)}`;
  }

  function checkDuplicate(key) {
    const currentMs = now();
    const lastMs = seenByKey.get(key) || 0;
    const elapsed = currentMs - lastMs;
    const duplicate = elapsed >= 0 && elapsed < cooldownMs;

    if (!duplicate) seenByKey.set(key, currentMs);

    return { duplicate, elapsedMs: elapsed };
  }

  function buildEnvelope({ contextId, source, status, payload, meta }) {
    assertCanonicalContext(contextId, canonicalContextId);
    return createEventEnvelope({
      contextId,
      source,
      status,
      payload,
      meta,
      updatedAt: isoNow(now)
    });
  }

  function send({ contextId, source = 'manual', payload, meta }) {
    const envelope = buildEnvelope({ contextId, source, status: 'send', payload, meta });
    const key = dedupeKey({ contextId, source, status: 'send', payload });
    const dedupe = checkDuplicate(key);
    return { ok: !dedupe.duplicate, envelope, dedupe };
  }

  function ack({ contextId, source = 'bot-relay', payload, meta }) {
    const envelope = buildEnvelope({ contextId, source, status: 'ack', payload, meta });
    return { ok: true, envelope };
  }

  function error({ contextId, source = 'bot-relay', error: err, payload, meta }) {
    const mappedError = mapBridgeError(err);
    const envelope = buildEnvelope({
      contextId,
      source,
      status: 'error',
      payload: {
        ...payload,
        mapped_error: mappedError,
        raw_error: String(err?.message || err || 'unknown')
      },
      meta
    });
    return { ok: true, envelope, mappedError };
  }

  function retry({ contextId, source = 'bot-relay', attempt = 1, payload, meta }) {
    const envelope = buildEnvelope({
      contextId,
      source,
      status: 'retry',
      payload: {
        attempt,
        ...payload
      },
      meta
    });

    const key = dedupeKey({ contextId, source, status: 'retry', payload: envelope.payload });
    const dedupe = checkDuplicate(key);
    return { ok: !dedupe.duplicate, envelope, dedupe };
  }

  return {
    send,
    ack,
    error,
    retry,
    _internal: {
      dedupeKey,
      seenByKey
    }
  };
}
