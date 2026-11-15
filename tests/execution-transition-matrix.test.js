import { test, expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { migrate } from '../src/infrastructure/sqlite/migrate.js';
import { createStores } from '../src/infrastructure/sqlite/stores.js';
import { createExecutionKernel } from '../src/modules/execution/execution-kernel.js';

test('the complete transition matrix accepts every legal edge and rejects every other edge', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'transition-matrix-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  const stores = createStores(db);
  const kernel = createExecutionKernel({ db, stores });
  const matrix = {
    PENDING: ['READY', 'WAITING', 'BLOCKED', 'CANCELLED', 'SKIPPED'],
    READY: ['RUNNING', 'WAITING', 'BLOCKED', 'CANCELLED', 'SKIPPED'],
    RUNNING: ['SUCCEEDED', 'FAILED', 'WAITING', 'BLOCKED', 'CANCELLED'],
    WAITING: ['READY', 'CANCELLED'],
    BLOCKED: ['READY', 'CANCELLED'],
    FAILED: ['READY', 'CANCELLED'],
    SUCCEEDED: [],
    CANCELLED: [],
    SKIPPED: [],
  };
  const statuses = Object.keys(matrix);
  for (const fromStatus of statuses) {
    expect(kernel.allowedTransitions(fromStatus)).toEqual(matrix[fromStatus]);
    for (const toStatus of statuses) {
      const jobId = randomUUID();
      const stepId = randomUUID();
      stores.jobs.create({ id: jobId, subjectType: 'PRODUCT', subjectId: 'matrix', jobType: 'TEST', status: fromStatus });
      stores.jobs.addStep({ id: stepId, jobId, name: `${fromStatus}-${toStatus}`, status: fromStatus, reasonCode: ['WAITING', 'BLOCKED'].includes(fromStatus) ? 'TEST_REASON' : null, humanMessage: ['WAITING', 'BLOCKED'].includes(fromStatus) ? 'دلیل تست' : null });
      const action = () => kernel.transition({ jobId, stepId, toStatus, reasonCode: ['WAITING', 'BLOCKED'].includes(toStatus) ? 'TEST_REASON' : null, humanMessage: ['WAITING', 'BLOCKED'].includes(toStatus) ? 'دلیل تست' : null, actor: 'test' });
      if (matrix[fromStatus].includes(toStatus)) expect(action).not.toThrow();
      else expect(action).toThrow('ILLEGAL_STEP_TRANSITION');
    }
  }
  db.close();
});
