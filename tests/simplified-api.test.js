import { test, expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { migrate } from '../src/infrastructure/sqlite/migrate.js';
import { createStores } from '../src/infrastructure/sqlite/stores.js';
import { createProductAutomationService } from '../src/application/product-automation.js';
import { createSourceIntake } from '../src/application/source-intake.js';
import { createExecutionKernel } from '../src/modules/execution/execution-kernel.js';
import { createStudioQueries } from '../src/application/studio-queries.js';
import { createServer } from '../src/server.js';

test('one multipart request starts a run with a source file; update and cancel use persisted state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'simplified-api-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  const stores = createStores(db);
  const server = createServer({ stores, automation: createProductAutomationService({ db, stores }), sourceIntake: createSourceIntake({ db, stores }), execution: createExecutionKernel({ db, stores }), queries: createStudioQueries({ stores }), publicDir: new URL('../public/', import.meta.url) });
  try {
    const form = new FormData();
    form.set('productName', 'TORINO');
    form.set('sourceFile', new File(['# TORINO\nنام: تورینو'], 'TORINO.md', { type: 'text/markdown' }));
    const started = await fetch(`${server.url.origin}/api/runs`, { method: 'POST', body: form });
    expect(started.status).toBe(201);
    const { jobId } = await started.json();
    let run = await (await fetch(`${server.url.origin}/api/runs/${jobId}`)).json();
    expect(run.sourceDocuments[0]).toMatchObject({ filename: 'TORINO.md', version: 1, status: 'UPLOADED_UNVERIFIED' });
    const update = new FormData();
    update.set('sourceFile', new File(['# TORINO\nنسخه جدید'], 'TORINO-v2.md', { type: 'text/markdown' }));
    const uploaded = await fetch(`${server.url.origin}/api/runs/${jobId}/source-documents`, { method: 'POST', body: update });
    expect(uploaded.status).toBe(201);
    run = await (await fetch(`${server.url.origin}/api/runs/${jobId}`)).json();
    expect(run.sourceDocuments.map(item => item.version)).toEqual([2, 1]);
    const cancelled = await fetch(`${server.url.origin}/api/runs/${jobId}/cancel`, { method: 'POST' });
    expect(cancelled.status).toBe(200);
    expect((await (await fetch(`${server.url.origin}/api/runs/${jobId}`)).json()).status).toBe('CANCELLED');
    expect((await fetch(`${server.url.origin}/api/runs/${jobId}/cancel`, { method: 'POST' })).status).toBe(409);
  } finally { server.stop(true); db.close(); }
}, 30000);

test('invalid uploaded file does not create a product or run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'simplified-api-invalid-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  const stores = createStores(db);
  const server = createServer({ stores, automation: createProductAutomationService({ db, stores }), queries: createStudioQueries({ stores }), publicDir: new URL('../public/', import.meta.url) });
  try {
    const form = new FormData();
    form.set('productName', 'TORINO');
    form.set('sourceFile', new File(['bad'], 'prices.exe'));
    expect((await fetch(`${server.url.origin}/api/runs`, { method: 'POST', body: form })).status).toBe(400);
    expect(stores.jobs.list()).toHaveLength(0);
  } finally { server.stop(true); db.close(); }
}, 30000);
