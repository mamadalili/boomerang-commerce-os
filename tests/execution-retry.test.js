import { test, expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { migrate } from '../src/infrastructure/sqlite/migrate.js';
import { createStores } from '../src/infrastructure/sqlite/stores.js';
import { createExecutionKernel } from '../src/modules/execution/execution-kernel.js';

test('retry returns a failed step to a clean READY timing window while preserving history', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'execution-retry-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  const stores = createStores(db);
  const kernel = createExecutionKernel({ db, stores });
  const jobId = randomUUID();
  const stepId = randomUUID();
  stores.jobs.create({ id: jobId, subjectType: 'PRODUCT', subjectId: 'retry', jobType: 'TEST', status: 'READY' });
  stores.jobs.addStep({ id: stepId, jobId, name: 'Retryable', status: 'READY' });
  kernel.transition({ jobId, stepId, toStatus: 'RUNNING', actor: 'test' });
  kernel.transition({ jobId, stepId, toStatus: 'FAILED', evidenceReference: 'log://first-attempt', actor: 'test' });
  expect(stores.jobs.getStep(stepId).finished_at).toBeTruthy();
  kernel.transition({ jobId, stepId, toStatus: 'READY', actor: 'test' });
  expect(stores.jobs.getStep(stepId)).toMatchObject({ status: 'READY', started_at: null, finished_at: null, reason_code: null });
  expect(stores.jobs.transitions(stepId).map(item => item.to_status)).toEqual(['RUNNING', 'FAILED', 'READY']);
  db.close();
});
