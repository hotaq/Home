function parseGitHubIssueUrl(url) {
  const match = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2], issue: match[3] };
}

async function fetchIssueMeta(thread) {
  const parsed = parseGitHubIssueUrl(thread.url);
  if (!parsed) return null;

  const apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/issues/${parsed.issue}`;
  const res = await fetch(apiUrl, {
    headers: { Accept: 'application/vnd.github+json' }
  });

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}`);
  }

  const issue = await res.json();
  return {
    title: issue.title,
    state: issue.state,
    number: issue.number,
    repo: `${parsed.owner}/${parsed.repo}`
  };
}

function renderThreadItem(threadsEl, thread, issueMeta) {
  const li = document.createElement('li');

  if (issueMeta) {
    li.innerHTML = `<a href="${thread.url}" target="_blank" rel="noopener">#${issueMeta.number} ${issueMeta.title}</a> <span class="meta">(${issueMeta.repo} · ${issueMeta.state})</span>`;
  } else {
    li.innerHTML = `<a href="${thread.url}" target="_blank" rel="noopener">${thread.name}</a> <span class="meta">(fallback)</span>`;
  }

  threadsEl.appendChild(li);
}

async function load() {
  const res = await fetch('./data.json');
  const data = await res.json();

  document.getElementById('decision').innerHTML = `
    <strong>${data.decision.title}</strong><br/>
    Owner: ${data.decision.owner}<br/>
    Due: ${data.decision.due}
  `;

  const threads = document.getElementById('threads');
  for (const thread of data.threads) {
    try {
      const issueMeta = await fetchIssueMeta(thread);
      renderThreadItem(threads, thread, issueMeta);
    } catch {
      renderThreadItem(threads, thread, null);
    }
  }

  const roster = document.getElementById('roster');
  data.roster.forEach(r => {
    const li = document.createElement('li');
    li.textContent = `${r.name} — ${r.role} (${r.status})`;
    roster.appendChild(li);
  });

  const health = document.getElementById('health');
  data.health.forEach(h => {
    const li = document.createElement('li');
    li.textContent = h;
    health.appendChild(li);
  });
}

load();