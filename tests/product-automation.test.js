import { test, expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { migrate } from '../src/infrastructure/sqlite/migrate.js';
import { createStores } from '../src/infrastructure/sqlite/stores.js';
import { createProductAutomationService } from '../src/application/product-automation.js';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'automation-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  const stores = createStores(db);
  return { db, stores, service: createProductAutomationService({ db, stores }) };
}

test('blank product name is rejected without persistence', async () => {
  const { db, stores, service } = await setup();
  expect(() => service.start({ productName: '  ', actor: 'admin' })).toThrow('PRODUCT_NAME_REQUIRED');
  expect(stores.products.list()).toHaveLength(0);
  expect(stores.jobs.list()).toHaveLength(0);
  db.close();
});

test('starting Product automation atomically persists its honest dependency graph and audit event', async () => {
  const { db, stores, service } = await setup();
  const result = service.start({ productName: 'TORINO', actor: 'admin' });
  const job = stores.jobs.get(result.jobId);
  const graph = stores.jobs.graph(result.jobId);
  expect(stores.products.get(result.productId).canonical_name).toBe('TORINO');
  expect(job.status).toBe('WAITING');
  expect(graph.steps).toHaveLength(22);
  expect(graph.dependencies.length).toBeGreaterThan(20);
  expect(graph.steps.some(step => step.status === 'WAITING' && step.reason_code === 'SOURCE_CONFIGURATION_REQUIRED')).toBe(true);
  expect(graph.steps.filter(step => step.status === 'WAITING').every(step => step.human_message)).toBe(true);
  expect(stores.audit.list(result.jobId).map(event => event.action)).toContain('PRODUCT_AUTOMATION_STARTED');
  db.close();
});
