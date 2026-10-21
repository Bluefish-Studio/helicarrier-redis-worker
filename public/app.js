async function refresh() {
  const status = document.querySelector('#status');
  const rows = document.querySelector('#jobs');
  try {
    const response = await fetch('/api/jobs', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    document.querySelector('#help').textContent = 'The release command creates the jobs. The worker processes them independently of this page.';
    rows.replaceChildren();
    for (const job of data.jobs) {
      const row = document.createElement('tr');
      for (const [index, value] of [job.label, job.state, job.attempts, job.units ?? '—'].entries()) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        if (index === 1) cell.className = `state ${job.state}`;
        row.append(cell);
      }
      rows.append(row);
    }
    status.textContent = data.complete ? '3 / 3 completed' : `${data.jobs.filter(job => job.state === 'completed').length} / 3 completed`;
    status.className = data.complete ? 'complete' : '';
    if (!data.jobs.length) {
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = 'No demo jobs yet. Run npm run seed as the release command.';
      const row = document.createElement('tr');
      row.append(cell); rows.append(row);
    }
  } catch {
    status.textContent = 'Queue unavailable';
    status.className = '';
    document.querySelector('#help').textContent = 'The queue could not be read. Check Redis, the private reference, and service logs. Retrying shortly.';
  } finally {
    setTimeout(refresh, 2000);
  }
}
refresh();
