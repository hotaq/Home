async function load() {
  const res = await fetch('./data.json');
  const data = await res.json();

  document.getElementById('decision').innerHTML = `
    <strong>${data.decision.title}</strong><br/>
    Owner: ${data.decision.owner}<br/>
    Due: ${data.decision.due}
  `;

  const threads = document.getElementById('threads');
  data.threads.forEach(t => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${t.url}" target="_blank">${t.name}</a>`;
    threads.appendChild(li);
  });

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
