import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('jobs retry, survive worker restart, seed idempotently, and expose only read-only results', { timeout: 30000 }, async t => {
  let redis;
  if (process.env.TEST_REDIS_URL) {
    const url = new URL(process.env.TEST_REDIS_URL);
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Tests require an isolated loopback Redis, never a remote database.');
    process.env.REDIS_URL = process.env.TEST_REDIS_URL;
  } else {
    const port = await freePort();
    redis = spawn('redis-server', ['--bind','127.0.0.1','--port',String(port),'--save','','--appendonly','no','--maxmemory-policy','noeviction'], { stdio: ['ignore','pipe','pipe'] });
    await new Promise((resolve,reject) => {
      const deadline = globalThis.setTimeout(() => reject(new Error('Test Redis did not start.')), 5000);
      redis.once('error', reject);
      redis.stdout.on('data', chunk => { if (String(chunk).includes('Ready to accept connections')) { clearTimeout(deadline); resolve(); } });
      redis.once('exit', code => reject(new Error(`Test Redis exited: ${code}`)));
    });
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
  }
  process.env.QUEUE_PREFIX = `test-${randomUUID()}`;
  const { connection, verifyRedis, makeQueue, seed, summary } = await import('../src/queue.mjs');
  const { startWorker } = await import('../src/worker.mjs');
  const { createStatusServer } = await import('../src/server.mjs');
  const client = connection();
  const workerClient = connection({ worker: true });
  let queue, worker, server;
  t.after(async () => {
    try {
      if (server) await new Promise(resolve => server.close(resolve));
      await worker?.close();
      if (client.status !== 'ready') await once(client, 'ready');
      if (queue) { await queue.obliterate({ force: true }); await queue.close(); }
    } finally {
      client.disconnect(); workerClient.disconnect();
      if (redis) { redis.kill('SIGTERM'); await once(redis, 'exit'); }
    }
  });
  await verifyRedis(client);
  await verifyRedis(workerClient);
  const wrongPolicyClient = connection();
  try {
    await client.config('SET', 'maxmemory-policy', 'allkeys-lru');
    await assert.rejects(verifyRedis(wrongPolicyClient), /requires maxmemory-policy=noeviction/);
  } finally {
    wrongPolicyClient.disconnect();
    await client.config('SET', 'maxmemory-policy', 'noeviction');
  }
  queue = makeQueue(client);
  await seed(queue); await seed(queue);
  assert.equal(await queue.count(), 3, 'Reseeding does not add duplicate job IDs');
  assert.equal((await summary(queue)).complete, false);
  worker = startWorker(workerClient);
  const deadline = Date.now() + 15000;
  let result;
  do { await setTimeout(150); result = await summary(queue); } while (!result.complete && Date.now() < deadline);
  assert.equal(result.complete, true);
  assert.deepEqual(result.jobs.map(job => [job.id,job.attempts,job.units]), [['launch-report',1,24],['retry-report',2,12],['usage-report',1,36]]);
  await worker.close();
  worker = startWorker(workerClient);
  await seed(queue);
  assert.deepEqual(await summary(queue), result, 'Worker restart and repeat seed retain completed results');
  server = createStatusServer(queue, client);
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base);
  assert.equal(page.status,200);
  assert.match(page.headers.get('x-robots-tag'),/noindex/);
  assert.match(await page.text(), /Queue lab/);
  assert.deepEqual(await (await fetch(`${base}/health`)).json(), {ok:true});
  assert.deepEqual(await (await fetch(`${base}/api/jobs`)).json(), result);
  assert.equal((await fetch(`${base}/api/jobs`, {method:'POST'})).status,405);
  assert.equal((await fetch(`${base}/.env`)).status,404);
  client.disconnect();
  if (client.status !== 'end') await once(client, 'end');
  const unavailable = await fetch(`${base}/api/jobs`);
  assert.equal(unavailable.status,503);
  assert.doesNotMatch(await unavailable.text(), /redis:\/\/|password|127\.0\.0\.1/);
  await client.connect();
});
