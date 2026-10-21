import { setTimeout } from 'node:timers/promises';
import { Worker } from 'bullmq';
import { queueName, prefix } from './queue.mjs';

export function startWorker(client) {
  const worker = new Worker(queueName, async job => {
    console.log(JSON.stringify({ event: 'job_started', job: job.id, attempt: job.attemptsMade + 1 }));
    if (job.data.failOnce && job.attemptsMade === 0) {
      throw new Error('Intentional transient failure for the retry demonstration.');
    }
    await setTimeout(800);
    // A deterministic calculation, with no email, payment, or external side effect.
    return { units: job.data.units, result: job.data.units * 2 };
  }, { connection: client, prefix, concurrency: 1 });
  worker.on('completed', job => console.log(JSON.stringify({ event: 'job_completed', job: job.id, attempts: job.attemptsMade })));
  worker.on('failed', job => console.log(JSON.stringify({ event: 'job_attempt_failed', job: job?.id, attempts: job?.attemptsMade })));
  worker.on('error', () => console.error('Worker connection error; waiting for Redis.'));
  return worker;
}
