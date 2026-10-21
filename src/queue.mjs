import IORedis from 'ioredis';
import { Queue } from 'bullmq';

export const queueName = 'reports';
export const prefix = process.env.QUEUE_PREFIX || 'helicarrier-guide';
export const samples = [
  { id: 'launch-report', label: 'Launch report', units: 24, failOnce: false },
  { id: 'retry-report', label: 'Retry demonstration', units: 12, failOnce: true },
  { id: 'usage-report', label: 'Usage report', units: 36, failOnce: false },
];

export function connection({ worker = false } = {}) {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required. Add a private service reference.');
  const client = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: worker,
    lazyConnect: true,
    connectTimeout: 5000,
    retryStrategy: times => Math.min(times * 500, 5000),
  });
  // Never print connection errors: their context can contain credentials or hosts.
  client.on('error', () => console.error('Redis connection unavailable; check the service and reference.'));
  return client;
}

export async function verifyRedis(client) {
  await client.connect();
  const values = await client.config('GET', 'maxmemory-policy');
  if (values[1] !== 'noeviction') {
    throw new Error('This queue requires maxmemory-policy=noeviction. Use a dedicated queue database.');
  }
}

export function makeQueue(client) {
  return new Queue(queueName, { connection: client, prefix });
}

export async function seed(queue) {
  // Fixed IDs make repeated seed commands safe while these demo jobs are retained.
  return queue.addBulk(samples.map(sample => ({
    name: 'generate-report',
    data: sample,
    opts: {
      jobId: sample.id,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 20 },
    },
  })));
}

export async function summary(queue) {
  const jobs = await Promise.all(samples.map(sample => queue.getJob(sample.id)));
  const entries = await Promise.all(jobs.filter(Boolean).map(async job => ({
    id: job.id,
    label: samples.find(sample => sample.id === job.id).label,
    state: await job.getState(),
    attempts: job.attemptsMade,
    units: typeof job.returnvalue?.units === 'number' ? job.returnvalue.units : null,
  })));
  return { jobs: entries, complete: entries.length === 3 && entries.every(job => job.state === 'completed') };
}
