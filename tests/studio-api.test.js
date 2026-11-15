import { test, expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { migrate } from '../src/infrastructure/sqlite/migrate.js';
import { seedDevelopment } from '../src/infrastructure/sqlite/seed.js';
import { createStores } from '../src/infrastructure/sqlite/stores.js';
import { createProductAutomationService } from '../src/application/product-automation.js';
import { createStudioQueries } from '../src/application/studio-queries.js';
import { createServer } from '../src/server.js';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'studio-api-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db); seedDevelopment(db);
  const stores = createStores(db);
  const server = createServer({ stores, automation: createProductAutomationService({ db, stores }), queries: createStudioQueries({ stores }), publicDir: new URL('../public/', import.meta.url) });
  return { db, stores, server, base: server.url.origin };
}

test('Product run creation appears in Today, Runs, detail and Product workspace', async () => {
  const { db, server, base } = await setup();
  const response = await fetch(`${base}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productName: 'TORINO' }) });
  expect(response.status).toBe(201);
  const created = await response.json();
  const today = await (await fetch(`${base}/api/today`)).json();
  const runs = await (await fetch(`${base}/api/runs`)).json();
  const detail = await (await fetch(`${base}/api/runs/${created.jobId}`)).json();
  const product = await (await fetch(`${base}/api/products/${created.productId}`)).json();
  expect(today.counts.waiting).toBe(1);
  expect(runs[0]).toMatchObject({ subject: 'TORINO', progress: 0, status: 'WAITING' });
  expect(detail.steps.find(step => step.name === 'Sources')).toMatchObject({ reason_code: 'SOURCE_CONFIGURATION_REQUIRED' });
  expect(product.product.canonical_name).toBe('TORINO');
  server.stop(true); db.close();
}, 30000);

test('API rejects invalid input, returns 404 and creates immutable prompt versions', async () => {
  const { db, server, base } = await setup();
  const invalid = await fetch(`${base}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productName: ' ' }) });
  expect(invalid.status).toBe(400);
  expect((await fetch(`${base}/api/runs/missing`)).status).toBe(404);
  const prompt = await (await fetch(`${base}/api/prompts/product:full_description`)).json();
  const saved = await fetch(`${base}/api/prompts/product:full_description/versions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: 'DEVELOPMENT v2' }) });
  expect(saved.status).toBe(201);
  const refreshed = await (await fetch(`${base}/api/prompts/product:full_description`)).json();
  expect(prompt.versions).toHaveLength(1);
  expect(refreshed.versions).toHaveLength(2);
  server.stop(true); db.close();
}, 30000);
