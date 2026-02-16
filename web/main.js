function parseGitHubIssueUrl(url) {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2], issue: match[3] };
}

function cacheKeyFromThread(thread) {
  return `issue-cache:${thread.url}`;
}

function getCachedIssue(thread) {
  try {
    const raw = localStorage.getItem(cacheKeyFromThread(thread));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.issue || !parsed?.cachedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedIssue(thread, issue) {
  try {
    localStorage.setItem(
      cacheKeyFromThread(thread),
      JSON.stringify({
        issue,
        cachedAt: Date.now()
      })
    );
  } catch {
    // Ignore localStorage write errors (private mode / quota).
  }
}

function formatCacheAge(cachedAt) {
  const mins = Math.max(1, Math.floor((Date.now() - cachedAt) / 60000));
  return mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
}

async function fetchIssueMeta(thread, { timeoutMs = 6000 } = {}) {
  const parsed = parseGitHubIssueUrl(thread.url);
  if (!parsed) return { ok: false, reason: 'invalid-url' };

  const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.issue}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(apiUrl, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal
    });

    if (!res.ok) {
      const cached = getCachedIssue(thread);
      if (cached) {
        return {
          ok: true,
          issue: cached.issue,
          source: 'cache',
          cachedAt: cached.cachedAt,
          reason: `http-${res.status}`
        };
      }
      return { ok: false, reason: `http-${res.status}` };
    }

    const issue = await res.json();
    const issueMeta = {
      title: issue.title,
      state: issue.state,
      number: issue.number,
      repo: `${parsed.owner}/${parsed.repo}`,
      comments: issue.comments,
      updatedAt: issue.updated_at
    };

    setCachedIssue(thread, issueMeta);

    return {
      ok: true,
      issue: issueMeta,
      source: 'live'
    };
  } catch (err) {
    const cached = getCachedIssue(thread);
    if (cached) {
      return {
        ok: true,
        issue: cached.issue,
        source: 'cache',
        cachedAt: cached.cachedAt,
        reason: err?.name === 'AbortError' ? 'timeout' : 'network'
      };
    }

    return { ok: false, reason: err?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeout);
  }
}

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  return new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      resolve();
    } catch (err) {
      reject(err);
    } finally {
      textarea.remove();
    }
  });
}

function findCanonicalGovernanceThread(threads = []) {
  return threads.find((thread) => /\/issues\/3(?:$|[?#])/i.test(thread.url));
}

function renderQuickActions(data) {
  const container = document.getElementById('quick-actions');
  const statusEl = document.getElementById('quick-actions-status');

  const primaryThread = data.threads?.[0]?.url;
  const governanceThread = findCanonicalGovernanceThread(data.threads || []);
  const boardThread = governanceThread?.url;

  const actions = [
    { label: 'คัดลอก /ritual', copy: '/ritual <topic>\nContext:\nDecision:\nAction:' },
    { label: 'คัดลอก /council vote', copy: '/council vote <proposal>\nOption A:\nOption B:\nDeadline:' },
    primaryThread ? { label: 'เปิด Recruitment', href: primaryThread } : null,
    boardThread ? { label: 'เปิด Trial Board', href: boardThread } : null
  ].filter(Boolean);

  actions.forEach((action) => {
    if (action.copy) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quick-btn';
      button.textContent = action.label;
      button.addEventListener('click', async () => {
        try {
          await copyText(action.copy);
          statusEl.textContent = `คัดลอกแล้ว: ${action.label}`;
        } catch {
          statusEl.textContent = 'คัดลอกไม่สำเร็จ ลองใหม่อีกครั้ง';
        }
      });
      container.appendChild(button);
      return;
    }

    const link = document.createElement('a');
    link.className = 'quick-btn';
    link.href = action.href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = action.label;
    container.appendChild(link);
  });

  if (!governanceThread && statusEl) {
    statusEl.textContent = '⚠️ ไม่พบ canonical governance thread (#3) ใน data.json';
    statusEl.classList.add('status-warn');
  }
}

function formatUpdatedAt(iso) {
  if (!iso) return 'n/a';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'n/a';
  return d.toLocaleString('th-TH', { hour12: false });
}

function createExternalLink({ href, text }) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = text;
  return link;
}

function appendMetaText(parent, text, className = 'meta') {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  parent.appendChild(span);
}

function renderThreadItem(threadsEl, thread, result) {
  const li = document.createElement('li');

  if (result?.ok) {
    const issueMeta = result.issue;
    const stateClass = issueMeta.state === 'open' ? 'badge-open' : 'badge-closed';
    const sourceText =
      result.source === 'cache' ? `cached ${formatCacheAge(result.cachedAt)}` : 'live';

    li.appendChild(createExternalLink({ href: thread.url, text: `#${issueMeta.number} ${issueMeta.title}` }));
    appendMetaText(li, ` (${issueMeta.repo})`);

    const badge = document.createElement('span');
    badge.className = `badge ${stateClass}`;
    badge.textContent = issueMeta.state;
    li.appendChild(badge);

    appendMetaText(li, ` · ${sourceText}`);
    appendMetaText(li, ` · 💬 ${issueMeta.comments ?? 0}`);
    appendMetaText(li, ` · updated ${formatUpdatedAt(issueMeta.updatedAt)}`);
  } else {
    const reason = result?.reason ? ` · ${result.reason}` : '';
    li.appendChild(createExternalLink({ href: thread.url, text: thread.name }));
    appendMetaText(li, ` (fallback${reason})`);
  }

  threadsEl.appendChild(li);
}

function statusClassFromText(status = '') {
  const normalized = status.toLowerCase();
  if (normalized.includes('active')) return 'badge-open';
  if (normalized.includes('paused') || normalized.includes('hold')) return 'badge-paused';
  return 'badge-neutral';
}

async function loadThreads(data) {
  const threads = document.getElementById('threads');
  const statusEl = document.getElementById('threads-status');
  const governanceStatusEl = document.getElementById('governance-status');
  const openBadge = document.getElementById('open-threads-badge');

  const governanceThread = findCanonicalGovernanceThread(data.threads || []);
  if (governanceStatusEl) {
    if (governanceThread) {
      governanceStatusEl.textContent = `Governance thread check: OK (#3 ${governanceThread.name || ''})`;
      governanceStatusEl.classList.remove('status-warn');
    } else {
      governanceStatusEl.textContent = 'Governance thread check: MISSING (#3)';
      governanceStatusEl.classList.add('status-warn');
    }
  }

  const results = await Promise.all(data.threads.map((thread) => fetchIssueMeta(thread)));

  let liveCount = 0;
  let cacheCount = 0;
  let openCount = 0;

  results.forEach((result, index) => {
    if (result.ok && result.source === 'live') liveCount += 1;
    if (result.ok && result.source === 'cache') cacheCount += 1;
    if (result.ok && result.issue?.state === 'open') openCount += 1;
    renderThreadItem(threads, data.threads[index], result);
  });

  const fallbackCount = data.threads.length - liveCount - cacheCount;
  statusEl.textContent = `Live ${liveCount}/${data.threads.length} · cache ${cacheCount} · fallback ${fallbackCount}`;

  openBadge.textContent = `open: ${openCount}/${data.threads.length}`;
  openBadge.className = openCount > 0 ? 'badge badge-open' : 'badge badge-closed';
}

function formatFreshness(minutes) {
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function updateMonitorFreshness(fetchedAt, freshnessEl) {
  if (!fetchedAt || !freshnessEl) return;
  const minutes = (Date.now() - fetchedAt) / 60000;
  const freshness = formatFreshness(minutes);
  const level = minutes > 30 ? 'stale' : minutes > 10 ? 'aging' : 'fresh';
  freshnessEl.textContent = `staleness: ${freshness} (${level})`;
  freshnessEl.className = minutes > 30 ? 'meta meta-critical' : minutes > 10 ? 'meta meta-warn' : 'meta';
}

function formatCheckedAt(ts = Date.now()) {
  return new Date(ts).toLocaleTimeString('th-TH', { hour12: false });
}

function formatCountdown(msRemaining) {
  const safeMs = Math.max(0, msRemaining);
  const totalSec = Math.ceil(safeMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function updateNextRefreshUI({ hidden = document.hidden } = {}) {
  const nextEl = document.getElementById('monitor-next-refresh');
  if (!nextEl) return;

  if (hidden) {
    nextEl.textContent = 'next refresh: paused (tab hidden)';
    nextEl.className = 'meta meta-warn';
    return;
  }

  if (!window.monitorAutoRefreshAt) {
    nextEl.textContent = 'next refresh: --';
    nextEl.className = 'meta';
    return;
  }

  nextEl.textContent = `next refresh: ${formatCountdown(window.monitorAutoRefreshAt - Date.now())}`;
  nextEl.className = 'meta';
}

function startMonitorAutoRefresh(intervalMs = 5 * 60_000) {
  if (window.monitorAutoRefreshTimer) clearInterval(window.monitorAutoRefreshTimer);
  if (window.monitorRefreshCountdownTimer) clearInterval(window.monitorRefreshCountdownTimer);

  const run = async () => {
    if (document.hidden) {
      updateNextRefreshUI({ hidden: true });
      return;
    }
    await loadMonitorReport({ source: 'auto' });
    window.monitorAutoRefreshAt = Date.now() + intervalMs;
    updateNextRefreshUI();
  };

  window.monitorAutoRefreshAt = Date.now() + intervalMs;
  updateNextRefreshUI();
  window.monitorAutoRefreshTimer = setInterval(run, intervalMs);
  window.monitorRefreshCountdownTimer = setInterval(() => updateNextRefreshUI(), 1000);

  if (!window.monitorVisibilityBound) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        updateNextRefreshUI({ hidden: true });
        return;
      }

      const overdue = !window.monitorAutoRefreshAt || Date.now() >= window.monitorAutoRefreshAt;
      if (overdue) {
        loadMonitorReport({ source: 'auto' });
        window.monitorAutoRefreshAt = Date.now() + intervalMs;
      }
      updateNextRefreshUI();
    });
    window.monitorVisibilityBound = true;
  }
}

function getMonitorLoadState() {
  if (!window.monitorLoadState) {
    window.monitorLoadState = {
      inFlight: false,
      queuedManual: false,
      requestSeq: 0,
      latestAppliedSeq: 0
    };
  }
  return window.monitorLoadState;
}

function setupNetworkStatus() {
  const el = document.getElementById('network-status');
  if (!el) return;

  const render = () => {
    if (navigator.onLine) {
      el.textContent = 'Network: online';
      el.className = 'status status-ok';
      return;
    }

    el.textContent = 'Network: offline (using cached/last-known data)';
    el.className = 'status status-warn';
  };

  window.addEventListener('online', async () => {
    render();
    await loadMonitorReport({ source: 'auto-reconnect' });
    window.monitorAutoRefreshAt = Date.now() + 5 * 60_000;
    updateNextRefreshUI();
  });
  window.addEventListener('offline', render);
  render();
}

async function loadMonitorReport({ source = 'auto' } = {}) {
  const sectionEl = document.getElementById('monitor-section');
  const statusEl = document.getElementById('monitor-status');
  const reportEl = document.getElementById('monitor-report');
  const badgeEl = document.getElementById('monitor-badge');
  const freshnessEl = document.getElementById('monitor-freshness');
  const checkedEl = document.getElementById('monitor-last-check');
  const sourceEl = document.getElementById('monitor-source');
  const refreshStatusEl = document.getElementById('monitor-refresh-status');
  const refreshBtn = document.getElementById('monitor-refresh-btn');

  if (!statusEl || !reportEl || !badgeEl || !freshnessEl || !checkedEl || !sourceEl || !refreshStatusEl) return;

  const state = getMonitorLoadState();
  if (state.inFlight) {
    if (source === 'manual') {
      state.queuedManual = true;
      refreshStatusEl.textContent = 'มีงานรีเฟรชอยู่แล้ว จะรีเฟรชซ้ำให้อัตโนมัติ…';
    }
    return;
  }

  state.inFlight = true;
  if (sectionEl) sectionEl.setAttribute('aria-busy', 'true');
  if (refreshBtn) refreshBtn.disabled = true;

  const requestSeq = ++state.requestSeq;
  sourceEl.textContent = `source: ${source} · loading…`;
  sourceEl.className = 'meta';
  refreshStatusEl.textContent = source === 'manual' ? 'กำลังรีเฟรชรายงาน…' : '';

  try {
    if (!navigator.onLine) throw new Error('offline');

    const res = await fetch(`./monitor-latest.md?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`monitor-http-${res.status}`);
    const text = await res.text();
    if (requestSeq < state.latestAppliedSeq) return;
    state.latestAppliedSeq = requestSeq;
    reportEl.textContent = text.trim() || '(empty monitor report)';

    const normalized = text.toLowerCase();
    const failCount = (normalized.match(/fail/g) || []).length;

    if (failCount >= 2) {
      badgeEl.textContent = 'critical';
      badgeEl.className = 'badge badge-critical';
    } else if (failCount === 1) {
      badgeEl.textContent = 'warn';
      badgeEl.className = 'badge badge-warn';
    } else {
      badgeEl.textContent = 'ok';
      badgeEl.className = 'badge badge-open';
    }

    const incidentEl = document.getElementById('incident-lines');
    incidentEl.innerHTML = '';
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const incidentLines = lines.filter((l) => /fail|error|timeout/i.test(l));

    if (incidentLines.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No incident lines in latest report';
      incidentEl.appendChild(li);
    } else {
      incidentLines.slice(0, 8).forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        incidentEl.appendChild(li);
      });
    }

    const lastModifiedHeader = res.headers.get('last-modified');
    const fetchedAt = lastModifiedHeader ? new Date(lastModifiedHeader).getTime() : Date.now();
    updateMonitorFreshness(fetchedAt, freshnessEl);
    checkedEl.textContent = `checked: ${formatCheckedAt()}`;

    if (window.monitorFreshnessTimer) clearInterval(window.monitorFreshnessTimer);
    window.monitorFreshnessTimer = setInterval(() => updateMonitorFreshness(fetchedAt, freshnessEl), 60_000);

    statusEl.textContent = 'Monitor: loaded';
    sourceEl.textContent = `source: ${source} · ok`;
    sourceEl.className = 'meta';
    refreshStatusEl.textContent = source === 'manual' ? 'รีเฟรชแล้ว' : '';
  } catch (err) {
    const reason = err instanceof Error && err.message ? err.message : 'unknown-error';
    statusEl.textContent = 'Monitor: no latest report found (run monitor workflow)';
    badgeEl.textContent = 'unknown';
    badgeEl.className = 'badge badge-neutral';
    freshnessEl.textContent = 'staleness: unknown';
    freshnessEl.className = 'meta';
    sourceEl.textContent = `source: ${source} · fail (${reason})`;
    sourceEl.className = 'meta meta-warn';
    checkedEl.textContent = `checked: ${formatCheckedAt()}`;
    refreshStatusEl.textContent = source === 'manual' ? 'รีเฟรชไม่สำเร็จ' : '';
  } finally {
    state.inFlight = false;
    if (sectionEl) sectionEl.setAttribute('aria-busy', 'false');
    if (refreshBtn) refreshBtn.disabled = false;

    if (state.queuedManual) {
      state.queuedManual = false;
      loadMonitorReport({ source: 'manual' });
    }
  }
}

async function sha256Hex(input) {
  const enc = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function createFocusTrap(container) {
  if (!container) return () => {};

  const onKeydown = (e) => {
    if (e.key !== 'Tab') return;

    const focusables = [...container.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'
    )].filter((el) => !el.hasAttribute('hidden'));

    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
      return;
    }

    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  container.addEventListener('keydown', onKeydown);
  return () => container.removeEventListener('keydown', onKeydown);
}

async function setupAccessGate(data) {
  const gate = document.getElementById('auth-gate');
  const main = document.getElementById('app-main');
  const hint = document.getElementById('gate-hint');
  const input = document.getElementById('gate-input');
  const btn = document.getElementById('gate-btn');
  const err = document.getElementById('gate-error');

  if (!data.access?.enabled) {
    gate.style.display = 'none';
    return true;
  }

  if (data.access.hint && hint) hint.textContent = data.access.hint;

  const unlocked = localStorage.getItem('cult-auth-ok') === data.access.passwordHash;
  if (unlocked) {
    gate.style.display = 'none';
    return true;
  }

  const releaseTrap = createFocusTrap(gate);
  main.style.filter = 'blur(2px)';
  main.inert = true;
  document.body.style.overflow = 'hidden';
  input?.focus();

  const attempt = async () => {
    const value = (input?.value || '').trim();
    if (!value) {
      if (err) err.textContent = 'Please enter access key';
      return;
    }
    const hex = await sha256Hex(value);
    if (hex === data.access.passwordHash) {
      localStorage.setItem('cult-auth-ok', hex);
      gate.style.display = 'none';
      main.style.filter = 'none';
      main.inert = false;
      document.body.style.overflow = '';
      releaseTrap();
      location.reload();
      return;
    }
    if (err) err.textContent = 'Invalid access key';
  };

  btn?.addEventListener('click', attempt);
  input?.addEventListener('input', () => {
    if (err?.textContent) err.textContent = '';
  });
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') attempt();
  });

  return false;
}

async function load() {
  try {
    const res = await fetch(`./data.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`data-http-${res.status}`);
    const data = await res.json();

    const ok = await setupAccessGate(data);
    if (!ok) return;

    setupNetworkStatus();

    const decisionEl = document.getElementById('decision');
    if (decisionEl) {
      decisionEl.replaceChildren();
      const title = document.createElement('strong');
      title.textContent = data.decision.title;
      decisionEl.appendChild(title);
      decisionEl.appendChild(document.createElement('br'));
      decisionEl.append(`Owner: ${data.decision.owner}`);
      decisionEl.appendChild(document.createElement('br'));
      decisionEl.append(`Due: ${data.decision.due}`);
    }

    if (data.nextAction) {
      const nextActionEl = document.getElementById('next-action');
      if (nextActionEl) {
        nextActionEl.replaceChildren();
        const task = document.createElement('strong');
        task.textContent = data.nextAction.task;
        nextActionEl.appendChild(task);
        nextActionEl.appendChild(document.createElement('br'));
        nextActionEl.append(`Owner: ${data.nextAction.owner}`);
        nextActionEl.appendChild(document.createElement('br'));
        nextActionEl.append(`Due: ${data.nextAction.due}`);
        nextActionEl.appendChild(document.createElement('br'));
        nextActionEl.appendChild(createExternalLink({ href: data.nextAction.link, text: 'open thread' }));
      }
    }

    await loadThreads(data);
    renderQuickActions(data);

    const roster = document.getElementById('roster');
    if (roster) {
      data.roster.forEach((r) => {
        const li = document.createElement('li');
        li.className = 'roster-item';

        const profile = document.createElement('span');
        profile.textContent = `${r.name} — ${r.role}`;

        const badge = document.createElement('span');
        badge.className = `badge ${statusClassFromText(r.status)}`;
        badge.textContent = r.status;

        li.append(profile, badge);
        roster.appendChild(li);
      });
    }

    const joinInstruction = document.getElementById('join-instruction');
    const joinKeyword = document.getElementById('join-keyword');
    if (joinInstruction && joinKeyword && data.join) {
      joinInstruction.textContent = data.join.instruction;
      joinKeyword.textContent = data.join.keyword;
    }

    const health = document.getElementById('health');
    if (health) {
      data.health.forEach((h) => {
        const li = document.createElement('li');
        li.textContent = h;
        health.appendChild(li);
      });
    }

    await loadMonitorReport();

    const refreshBtn = document.getElementById('monitor-refresh-btn');
    refreshBtn?.addEventListener('click', async () => {
      await loadMonitorReport({ source: 'manual' });
      window.monitorAutoRefreshAt = Date.now() + 5 * 60_000;
      updateNextRefreshUI();
    });

    startMonitorAutoRefresh(5 * 60_000);
  } catch (err) {
    const statusEl = document.getElementById('threads-status');
    if (statusEl) statusEl.textContent = 'Cannot load dashboard data right now';
    console.error('Dashboard load failed', err);
  }
}

load();
