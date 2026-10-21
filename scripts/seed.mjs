import { connection, verifyRedis, makeQueue, seed } from '../src/queue.mjs';

let client, queue;
try {
  client = connection();
  await verifyRedis(client);
  queue = makeQueue(client);
  await seed(queue);
  console.log('Three demo reports queued (existing IDs are retained).');
} catch {
  console.error('Could not seed the queue. Check the private Redis reference and noeviction policy.');
  process.exitCode = 1;
} finally {
  if (queue) await queue.close();
  client?.disconnect();
}
