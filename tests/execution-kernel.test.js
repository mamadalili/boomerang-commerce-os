import { test, expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { migrate } from '../src/infrastructure/sqlite/migrate.js';
import { createStores } from '../src/infrastructure/sqlite/stores.js';
import { createExecutionKernel } from '../src/modules/execution/execution-kernel.js';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'execution-kernel-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  const stores = createStores(db);
  const kernel = createExecutionKernel({ db, stores });
  const jobId = randomUUID();
  stores.jobs.create({ id: jobId, subjectType: 'PRODUCT', subjectId: 'product-1', jobType: 'TEST', status: 'PENDING' });
  return { db, stores, kernel, jobId };
}

function add(stores, jobId, name, status = 'PENDING') {
  const id = randomUUID();
  stores.jobs.addStep({ id, jobId, name, status });
  return id;
}

test('dependency reconciliation makes independent steps READY in parallel', async () => {
  const { db, stores, kernel, jobId } = await setup();
  const source = add(stores, jobId, 'Source', 'READY');
  const price = add(stores, jobId, 'Price');
  const inventory = add(stores, jobId, 'Inventory');
  stores.jobs.addDependency(price, source);
  stores.jobs.addDependency(inventory, source);
  kernel.transition({ jobId, stepId: source, toStatus: 'RUNNING', actor: 'test' });
  kernel.transition({ jobId, stepId: source, toStatus: 'SUCCEEDED', actor: 'test', evidenceReference: 'evidence://source' });
  expect(stores.jobs.getStep(price).status).toBe('READY');
  expect(stores.jobs.getStep(inventory).status).toBe('READY');
  expect(stores.jobs.get(jobId).status).toBe('READY');
  db.close();
});

test('illegal transitions and READY with unfinished dependencies are rejected', async () => {
  const { db, stores, kernel, jobId } = await setup();
  const parent = add(stores, jobId, 'Parent', 'READY');
  const child = add(stores, jobId, 'Child');
  stores.jobs.addDependency(child, parent);
  expect(() => kernel.transition({ jobId, stepId: child, toStatus: 'READY', actor: 'test' })).toThrow('DEPENDENCIES_NOT_SATISFIED');
  expect(() => kernel.transition({ jobId, stepId: parent, toStatus: 'SUCCEEDED', actor: 'test' })).toThrow('ILLEGAL_STEP_TRANSITION');
  db.close();
});

test('WAITING and BLOCKED require reason code and human message', async () => {
  const { db, stores, kernel, jobId } = await setup();
  const step = add(stores, jobId, 'Provider', 'READY');
  expect(() => kernel.transition({ jobId, stepId: step, toStatus: 'WAITING', actor: 'test' })).toThrow('STEP_REASON_REQUIRED');
  kernel.transition({ jobId, stepId: step, toStatus: 'WAITING', reasonCode: 'WAITING_FOR_GENERATION_PROVIDER', humanMessage: 'ارائه‌دهنده تولید پیکربندی نشده است.', actor: 'test' });
  expect(stores.jobs.getStep(step)).toMatchObject({ status: 'WAITING', reason_code: 'WAITING_FOR_GENERATION_PROVIDER' });
  db.close();
});

test('failed dependency persists a machine-readable blocker and transition evidence', async () => {
  const { db, stores, kernel, jobId } = await setup();
  const parent = add(stores, jobId, 'Parent', 'READY');
  const child = add(stores, jobId, 'Child');
  stores.jobs.addDependency(child, parent);
  kernel.transition({ jobId, stepId: parent, toStatus: 'RUNNING', actor: 'test' });
  kernel.transition({ jobId, stepId: parent, toStatus: 'FAILED', reasonCode: 'SOURCE_READ_FAILED', humanMessage: 'خواندن منبع شکست خورد.', evidenceReference: 'log://failure', actor: 'test' });
  expect(stores.jobs.getStep(child)).toMatchObject({ status: 'BLOCKED', reason_code: 'UPSTREAM_STEP_FAILED' });
  expect(stores.jobs.transitions(parent).at(-1)).toMatchObject({ to_status: 'FAILED', evidence_reference: 'log://failure' });
  expect(stores.jobs.get(jobId).status).toBe('FAILED');
  db.close();
});
