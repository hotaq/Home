function parseGitHubIssueUrl(url) {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2], issue: match[3] };
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
      return { ok: false, reason: `http-${res.status}` };
    }

    const issue = await res.json();
    return {
      ok: true,
      issue: {
        title: issue.title,
        state: issue.state,
        number: issue.number,
        repo: `${parsed.owner}/${parsed.repo}`
      }
    };
  } catch (err) {
    return { ok: false, reason: err?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeout);
  }
}

function renderThreadItem(threadsEl, thread, result) {
  const li = document.createElement('li');

  if (result?.ok) {
    const issueMeta = result.issue;
    const stateClass = issueMeta.state === 'open' ? 'badge-open' : 'badge-closed';
    li.innerHTML = `
      <a href="${thread.url}" target="_blank" rel="noopener">#${issueMeta.number} ${issueMeta.title}</a>
      <span class="meta">(${issueMeta.repo})</span>
      <span class="badge ${stateClass}">${issueMeta.state}</span>
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
  results.forEach((result, index) => {
    if (result.ok) liveCount += 1;
    renderThreadItem(threads, data.threads[index], result);
  });

  const fallbackCount = data.threads.length - liveCount;
  statusEl.textContent =
    fallbackCount > 0
      ? `Live ${liveCount}/${data.threads.length} · fallback ${fallbackCount}`
      : `Live ${liveCount}/${data.threads.length} · all synced`;
}

async function load() {
  const res = await fetch('./data.json');
  const data = await res.json();

  document.getElementById('decision').innerHTML = `
    <strong>${data.decision.title}</strong><br/>
    Owner: ${data.decision.owner}<br/>
    Due: ${data.decision.due}
  `;

  await loadThreads(data);

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
}

load();
