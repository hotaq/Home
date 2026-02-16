import crypto from 'node:crypto';

const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_EVENTS = 20;
const DEFAULT_DEDUPE_MAX_KEYS = 5_000;
const DEFAULT_SENDER_MAX_TRACKED = 1_000;
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
  senderPolicy = {},
  inboundRateLimit = {},
  dedupeMaxKeys = DEFAULT_DEDUPE_MAX_KEYS,
  senderMaxTracked = DEFAULT_SENDER_MAX_TRACKED,
  now = Date.now
} = {}) {
  const seenByKey = new Map();
  const traceLog = [];
  const senderWindow = new Map();

  const rateLimitWindowMs = Number(inboundRateLimit.windowMs) > 0
    ? Number(inboundRateLimit.windowMs)
    : DEFAULT_RATE_LIMIT_WINDOW_MS;
  const rateLimitMaxEvents = Number(inboundRateLimit.maxEvents) > 0
    ? Number(inboundRateLimit.maxEvents)
    : DEFAULT_RATE_LIMIT_MAX_EVENTS;
  const dedupeMax = Number(dedupeMaxKeys) > 0 ? Number(dedupeMaxKeys) : DEFAULT_DEDUPE_MAX_KEYS;
  const senderTrackMax = Number(senderMaxTracked) > 0 ? Number(senderMaxTracked) : DEFAULT_SENDER_MAX_TRACKED;

  function pruneSeenKeys() {
    while (seenByKey.size > dedupeMax) {
      const oldestKey = seenByKey.keys().next().value;
      if (!oldestKey) break;
      seenByKey.delete(oldestKey);
    }
  }

  function pruneSenderWindow(windowStart) {
    for (const [key, timestamps] of senderWindow.entries()) {
      const kept = timestamps.filter((ts) => ts >= windowStart);
      if (kept.length === 0) senderWindow.delete(key);
      else senderWindow.set(key, kept);
    }

    while (senderWindow.size > senderTrackMax) {
      const oldestSender = senderWindow.keys().next().value;
      if (!oldestSender) break;
      senderWindow.delete(oldestSender);
    }
  }

  function dedupeKey({ contextId, source, status, payload }) {
    return `${contextId}::${source}::${status}::${stablePayloadHash(payload)}`;
  }

  function checkDuplicate(key) {
    const currentMs = now();
    const lastMs = seenByKey.get(key) || 0;
    const elapsed = currentMs - lastMs;
    const duplicate = elapsed >= 0 && elapsed < cooldownMs;

    if (!duplicate) {
      if (seenByKey.has(key)) seenByKey.delete(key);
      seenByKey.set(key, currentMs);
      pruneSeenKeys();
    }

    return { duplicate, elapsedMs: elapsed };
  }

  function checkSenderAllowed({ senderId, botId }) {
    if (!botId || !senderId) return;

    const allowed = senderPolicy[String(botId)];
    if (!allowed || allowed === '*') return;

    const allowedList = Array.isArray(allowed) ? allowed.map(String) : [String(allowed)];
    if (!allowedList.includes(String(senderId))) {
      throw new Error(`sender-policy-violation: sender=${senderId} bot=${botId}`);
    }
  }

  function checkSenderRateLimit(senderId) {
    if (!senderId) return { limited: false, count: 0, windowMs: rateLimitWindowMs };

    const senderKey = String(senderId);
    const nowMs = now();
    const windowStart = nowMs - rateLimitWindowMs;

    pruneSenderWindow(windowStart);

    const kept = (senderWindow.get(senderKey) || []).filter((ts) => ts >= windowStart);
    kept.push(nowMs);
    if (senderWindow.has(senderKey)) senderWindow.delete(senderKey);
    senderWindow.set(senderKey, kept);
    pruneSenderWindow(windowStart);

    return {
      limited: kept.length > rateLimitMaxEvents,
      count: kept.length,
      maxEvents: rateLimitMaxEvents,
      windowMs: rateLimitWindowMs
    };
  }

  function appendTrace(entry) {
    traceLog.push({ ...entry, ts: isoNow(now) });
    if (traceLog.length > 500) traceLog.shift();
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

  function guardInbound({ senderId, botId }) {
    checkSenderAllowed({ senderId, botId });
    const rate = checkSenderRateLimit(senderId);
    if (rate.limited) {
      throw new Error(`sender-rate-limited: sender=${senderId} count=${rate.count}/${rate.maxEvents} window=${rate.windowMs}`);
    }
    return rate;
  }

  function send({ contextId, source = 'manual', payload, meta }) {
    const envelope = buildEnvelope({ contextId, source, status: 'send', payload, meta });
    const key = dedupeKey({ contextId, source, status: 'send', payload });
    const dedupe = checkDuplicate(key);
    appendTrace({ direction: 'outbound', status: 'send', contextId: String(contextId), source, ok: !dedupe.duplicate });
    return { ok: !dedupe.duplicate, envelope, dedupe };
  }

  function ack({ contextId, source = 'bot-relay', senderId, botId, payload, meta }) {
    const rate = guardInbound({ senderId, botId });
    const envelope = buildEnvelope({ contextId, source, status: 'ack', payload, meta: { ...meta, sender_id: senderId, bot_id: botId } });
    appendTrace({ direction: 'inbound', status: 'ack', contextId: String(contextId), source, senderId, botId, ok: true, rateCount: rate.count ?? 0 });
    return { ok: true, envelope, rateLimit: rate };
  }

  function error({ contextId, source = 'bot-relay', senderId, botId, error: err, payload, meta }) {
    const rate = guardInbound({ senderId, botId });
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
      meta: { ...meta, sender_id: senderId, bot_id: botId }
    });
    appendTrace({ direction: 'inbound', status: 'error', contextId: String(contextId), source, senderId, botId, ok: true, mappedError, rateCount: rate.count ?? 0 });
    return { ok: true, envelope, mappedError, rateLimit: rate };
  }

  function retry({ contextId, source = 'bot-relay', senderId, botId, attempt = 1, payload, meta }) {
    const rate = guardInbound({ senderId, botId });
    const envelope = buildEnvelope({
      contextId,
      source,
      status: 'retry',
      payload: {
        attempt,
        ...payload
      },
      meta: { ...meta, sender_id: senderId, bot_id: botId }
    });

    const key = dedupeKey({ contextId, source, status: 'retry', payload: envelope.payload });
    const dedupe = checkDuplicate(key);
    appendTrace({ direction: 'inbound', status: 'retry', contextId: String(contextId), source, senderId, botId, ok: !dedupe.duplicate, rateCount: rate.count ?? 0 });
    return { ok: !dedupe.duplicate, envelope, dedupe, rateLimit: rate };
  }

  return {
    send,
    ack,
    error,
    retry,
    _internal: {
      dedupeKey,
      seenByKey,
      traceLog,
      senderWindow,
      guardInbound,
      stats: () => ({
        seenKeys: seenByKey.size,
        trackedSenders: senderWindow.size,
        traceEntries: traceLog.length,
        dedupeMax,
        senderTrackMax,
        rateLimitWindowMs,
        rateLimitMaxEvents
      })
    }
  };
}
