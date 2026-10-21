# Redis background worker example

A Node.js/BullMQ worker processes three fictional reports. A separate, read-only HTTP service displays each job's state and attempt count. One report deliberately fails once, backs off, and succeeds on its second attempt. The sample processor makes no external calls and has no financial, email, or other irreversible effects.

This example is under verification for a Helicarrier screenshot guide. Do not describe the Helicarrier deployment as tested until its live verification record is complete. The standalone example repository remains private pending publication approval.

## Run locally

Requires Node.js 22 and a disposable Redis 8 instance. Dependencies are pinned in the lockfile.

```sh
npm ci
docker compose up -d --wait redis
cp .env.example .env
node --env-file=.env scripts/seed.mjs
SERVICE_ROLE=worker node --env-file=.env src/main.mjs
```

In another terminal, start the read-only dashboard:

```sh
node --env-file=.env src/main.mjs
```

Open `http://localhost:3000`. Expect three completed jobs with attempt counts **1, 2, 1**. `/health` checks that the web service can reach Redis; it does **not** prove that the separate worker is alive. Verify job completion and the worker's logs as well.

The local Redis is bound only to `127.0.0.1:15379`. It has no authentication or persistence and is for disposable local work only. Never expose it publicly or use these settings for valuable data. `.env` is ignored by Git and Docker; do not include connection URLs in screenshots, logs, or repository files.

## Helicarrier settings to verify

Push the source to your GitHub repository first and create three services in the same disposable project/environment:

| Service | Type | Configuration |
| --- | --- | --- |
| `tutorial-queue-redis` | Managed Redis | Redis 8, Heli KV-N, external access disabled |
| `tutorial-report-worker` | Worker | GitHub source; included Dockerfile; Heli S1; `SERVICE_ROLE=worker`; private Redis URL reference named `REDIS_URL` |
| `tutorial-queue-board` | Web | Same GitHub source/Dockerfile; Heli S1; port `3000`; `SERVICE_ROLE=web`; private Redis URL reference named `REDIS_URL`; release command `npm run seed` |

Use a standalone repository's root, or `examples/node-redis-worker` as the root directory in the platform monorepo. Leave install/build/start overrides blank. The image runs as the non-root `node` user and needs no writable application files; retain the read-only filesystem setting. The worker is a Worker service, has no public URL, and opens no HTTP port. The Dockerfile's `EXPOSE` metadata is only relevant to the Web service.

Create/configure Redis and the references before the final app deployments. An initial deployment without `REDIS_URL` intentionally fails with a sanitized setup message. Do not interpret a successful image build as a working service.

Current standard full-month reference prices are $2 for Heli KV-N and $3 each for two Heli S1 services: **$8/month combined**, before taxes, fees, or optional resources. A short tutorial run is not a full month's quote. Confirm your account's displayed rates, keep one worker instance for this example, and remove all three services when finished.

## Queue behavior and limits

- **Memory policy:** startup checks `CONFIG GET maxmemory-policy` and refuses to start unless it is `noeviction`. It does not modify Redis settings. A cache configured to evict arbitrary keys is not safe for BullMQ queue state. The check also requires permission to read that Redis configuration value.
- **Connection behavior:** workers retry connection requests without a per-request retry limit; the web/seed clients fail quickly instead of holding requests indefinitely. Redis error details are not logged because they can contain connection information.
- **Retry demonstration:** three attempts maximum, exponential backoff beginning at 1.5 seconds. The sample error is deliberate; real failures need investigation and alerting.
- **Duplicate handling:** seed uses three fixed job IDs, so repeating it does not duplicate retained jobs. IDs can be reused after jobs are removed. This is not universal business idempotency. Real side effects need durable, application-level idempotency keys and a system of record.
- **Retention:** only the last 20 completed and failed jobs are retained. Job results and queue state are teaching data, not a durable audit trail. No job payload contains real customer data.
- **Shutdown:** SIGTERM/SIGINT close the HTTP server or wait for the active short job, close queue connections, and exit. There is a 15-second application shutdown deadline. A force-killed job can be processed again; this is not exactly-once delivery.
- **Persistence:** a successful job and worker redeployment do not prove recovery from Redis restart or data loss. Verify the actual Redis persistence settings and restore path before using a queue for valuable work. The current Helicarrier Redis plans do not include the daily-backup add-on available to supported relational databases. Keep important business state elsewhere and plan replay/recovery.
- **Public surface:** only the known demo IDs, static labels, state, attempt counts, and numeric results are returned. There is no public job-creation or queue-management endpoint. Unknown paths return 404 and writes return 405. Search indexing is disabled for the demo.

See the primary BullMQ documentation for [connection behavior](https://docs.bullmq.io/guide/connections), [retry policies](https://docs.bullmq.io/guide/retrying-failing-jobs), and [graceful shutdown](https://docs.bullmq.io/guide/workers/graceful-shutdown).

## Verify

With `redis-server` installed locally, `npm test` starts and cleans up its own isolated Redis process. Alternatively, use an explicitly disposable loopback Redis:

```sh
TEST_REDIS_URL=redis://127.0.0.1:15379 npm test
```

The integration check uses a unique queue prefix and deletes only that test queue. It temporarily changes the isolated Redis memory policy to verify startup refusal, then restores `noeviction`. It checks completion, exact retry counts, repeat seed, worker restart, HTTP readiness, read-only methods, hidden files, and a sanitized unavailable-queue response. Never point it at a shared or production Redis.

## Cleanup

Stop the local Node processes with Ctrl+C and run `docker compose down`. Delete only this walkthrough's three disposable Helicarrier services after recording the result. Deleting Redis removes its queue data. Do not delete a database used by another application.
