import { connection, verifyRedis, makeQueue } from './queue.mjs';
import { startWorker } from './worker.mjs';
import { createStatusServer } from './server.mjs';

let client, queue, worker, server;
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => process.exit(1), 15000);
  deadline.unref();
  if (server) await new Promise(resolve => server.close(resolve));
  if (worker) await worker.close();
  if (queue) await queue.close();
  client?.disconnect();
  clearTimeout(deadline);
}
process.once('SIGTERM', () => shutdown().catch(() => process.exit(1)));
process.once('SIGINT', () => shutdown().catch(() => process.exit(1)));

try {
  const role = process.env.SERVICE_ROLE || 'web';
  if (!['web', 'worker'].includes(role)) throw new Error('Unknown service role.');
  client = connection({ worker: role === 'worker' });
  await verifyRedis(client);
  if (role === 'worker') {
    worker = startWorker(client);
    console.log('Report worker ready. No HTTP listener is required.');
  } else {
    queue = makeQueue(client);
    server = createStatusServer(queue, client);
    server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Read-only queue dashboard ready.'));
  }
} catch {
  console.error('Startup failed. Check SERVICE_ROLE, REDIS_URL, connectivity, and Redis noeviction policy.');
  await shutdown();
  process.exitCode = 1;
}
