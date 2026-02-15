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
      repo: `${parsed.owner}/${parsed.repo}`
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

function renderQuickActions(data) {
  const container = document.getElementById('quick-actions');
  const statusEl = document.getElementById('quick-actions-status');

  const primaryThread = data.threads?.[0]?.url;
  const boardThread = data.threads?.[1]?.url;

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
}

function renderThreadItem(threadsEl, thread, result) {
  const li = document.createElement('li');

  if (result?.ok) {
    const issueMeta = result.issue;
    const stateClass = issueMeta.state === 'open' ? 'badge-open' : 'badge-closed';
    const sourceText =
      result.source === 'cache' ? `cached ${formatCacheAge(result.cachedAt)}` : 'live';

    li.innerHTML = `
      <a href="${thread.url}" target="_blank" rel="noopener">#${issueMeta.number} ${issueMeta.title}</a>
      <span class="meta">(${issueMeta.repo})</span>
      <span class="badge ${stateClass}">${issueMeta.state}</span>
      <span class="meta">· ${sourceText}</span>
    `;
  } else {
    const reason = result?.reason ? ` · ${result.reason}` : '';
    li.innerHTML = `<a href="${thread.url}" target="_blank" rel="noopener">${thread.name}</a> <span class="meta">(fallback${reason})</span>`;
  }

  threadsEl.appendChild(li);
}

async function loadThreads(data) {
  const threads = document.getElementById('threads');
  const statusEl = document.getElementById('threads-status');

  const results = await Promise.all(data.threads.map((thread) => fetchIssueMeta(thread)));

  let liveCount = 0;
  let cacheCount = 0;

  results.forEach((result, index) => {
    if (result.ok && result.source === 'live') liveCount += 1;
    if (result.ok && result.source === 'cache') cacheCount += 1;
    renderThreadItem(threads, data.threads[index], result);
  });

  const fallbackCount = data.threads.length - liveCount - cacheCount;
  statusEl.textContent = `Live ${liveCount}/${data.threads.length} · cache ${cacheCount} · fallback ${fallbackCount}`;
}

async function load() {
  try {
    const res = await fetch('./data.json');
    if (!res.ok) throw new Error(`data-http-${res.status}`);
    const data = await res.json();

    document.getElementById('decision').innerHTML = `
      <strong>${data.decision.title}</strong><br/>
      Owner: ${data.decision.owner}<br/>
      Due: ${data.decision.due}
    `;

    await loadThreads(data);
    renderQuickActions(data);

    const roster = document.getElementById('roster');
    data.roster.forEach((r) => {
      const li = document.createElement('li');
      li.textContent = `${r.name} — ${r.role} (${r.status})`;
      roster.appendChild(li);
    });

    const health = document.getElementById('health');
    data.health.forEach((h) => {
      const li = document.createElement('li');
      li.textContent = h;
      health.appendChild(li);
    });
  } catch (err) {
    document.getElementById('threads-status').textContent = 'Cannot load dashboard data right now';
    console.error('Dashboard load failed', err);
  }
}

load();
