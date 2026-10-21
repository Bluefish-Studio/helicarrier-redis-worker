import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { summary } from './queue.mjs';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

export function createStatusServer(queue, client) {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      return res.end('Read-only demo. Seed jobs through the release command.');
    }
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/health' || path === '/api/jobs') {
        const data = path === '/health' ? { ok: await client.ping() === 'PONG' } : await summary(queue);
        res.setHeader('Content-Type', 'application/json');
        return res.end(req.method === 'HEAD' ? '' : JSON.stringify(data));
      }
      const asset = assets.get(path);
      if (!asset) { res.writeHead(404); return res.end('Not found'); }
      const data = await readFile(new URL(`../public/${asset[0]}`, import.meta.url));
      res.setHeader('Content-Type', asset[1]);
      res.end(req.method === 'HEAD' ? '' : data);
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Queue unavailable. Check Redis and the private reference.' }));
    }
  });
}
