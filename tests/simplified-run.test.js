import { test, expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { migrate } from '../src/infrastructure/sqlite/migrate.js';
import { createStores } from '../src/infrastructure/sqlite/stores.js';
import { createProductAutomationService } from '../src/application/product-automation.js';
import { createExecutionKernel } from '../src/modules/execution/execution-kernel.js';
import { createStudioQueries } from '../src/application/studio-queries.js';
import { renderRunDetail } from '../public/views/run-detail.js';

test('the run view begins with five readable phases and keeps 22 persisted steps in disclosure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'simplified-run-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  const stores = createStores(db);
  const created = createProductAutomationService({ db, stores }).start({ productName: 'TORINO' });
  const run = createStudioQueries({ stores }).run(created.jobId);
  const html = renderRunDetail(run, value => String(value), status => `<span>${status}</span>`);
  expect((html.match(/class="phase-card/g) ?? [])).toHaveLength(5);
  expect(html).toContain('<details');
  expect(html).toContain('مرحله‌ها و وابستگی‌ها');
  expect(html).toContain('data-cancel-run');
  expect(html).not.toContain('Pause / Resume / Cancel');
  expect(run.steps).toHaveLength(22);
  db.close();
});

test('cancel persists terminal state for every unfinished step and refuses later transitions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cancel-run-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  const stores = createStores(db);
  const created = createProductAutomationService({ db, stores }).start({ productName: 'TORINO' });
  const execution = createExecutionKernel({ db, stores });
  execution.cancel(created.jobId, 'admin');
  expect(stores.jobs.get(created.jobId).status).toBe('CANCELLED');
  expect(stores.jobs.graph(created.jobId).steps.every(step => step.status === 'CANCELLED')).toBe(true);
  expect(() => execution.transition({ jobId: created.jobId, stepId: stores.jobs.graph(created.jobId).steps[0].id, toStatus: 'READY' })).toThrow('ILLEGAL_STEP_TRANSITION');
  db.close();
});
