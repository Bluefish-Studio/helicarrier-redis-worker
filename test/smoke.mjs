import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const base = 'http://127.0.0.1:3000';
let result;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch(`${base}/api/jobs`, { signal: AbortSignal.timeout(2000) });
    if (response.ok) result = await response.json();
    if (result?.complete) break;
  } catch { /* Containers may still be starting. */ }
  await setTimeout(500);
}
assert.equal(result?.complete, true, 'The read-only worker completes all three jobs.');
assert.deepEqual(result.jobs.map(job => job.attempts), [1,2,1]);
assert.deepEqual(await (await fetch(`${base}/health`)).json(), {ok:true});
assert.equal((await fetch(`${base}/api/jobs`, {method:'POST'})).status,405);
console.log('Read-only worker and web containers passed: three jobs, one retry, healthy Redis, no public writes.');
