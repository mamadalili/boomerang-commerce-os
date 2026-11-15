import { test, expect } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { migrate } from '../src/infrastructure/sqlite/migrate.js';
import { seedDevelopment, PROMPTS } from '../src/infrastructure/sqlite/seed.js';
import { createStores } from '../src/infrastructure/sqlite/stores.js';
import { createServer } from '../src/server.js';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'commerce-os-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  return { db, stores: createStores(db) };
}

test('migrations are repeatable, enable foreign keys and create the C1 schema', async () => {
  const { db } = await fixture();
  migrate(db);
  expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  const names = db.prepare("select name from sqlite_master where type='table'").all().map(row => row.name);
  for (const name of ['products','product_variants','authoritative_sources','source_references','prices','inventory_snapshots','prompt_templates','prompt_versions','jobs','job_steps','step_dependencies','artifacts','generation_runs','publication_runs','verification_runs','audit_events','execution_reports','final_product_approvals','qa_results']) expect(names).toContain(name);
  db.close();
});

test('Product and Variant persist and invalid product foreign key fails', async () => {
  const { db, stores } = await fixture();
  stores.products.create({ id: 'p1', canonicalName: 'تورینو', productId: 'TORINO', resolutionState: 'EXISTING_PRODUCT' });
  stores.products.createVariant({ id: 'v1', productId: 'p1', sku: 'TOR-W-60', color: 'سفید', dimensions: '60cm' });
  expect(stores.products.list()[0].canonical_name).toBe('تورینو');
  expect(() => stores.products.createVariant({ id: 'bad', productId: 'missing', sku: 'X' })).toThrow();
  db.close();
});

test('authoritative replacement preserves history and policies differ by kind', async () => {
  const { db, stores } = await fixture();
  stores.sources.activate({ id: 's1', kind: 'PRICE', name: 'Development price', version: '1', location: 'fixture', operatingContext: 'dev', freshnessPolicy: { mode: 'valid_until_next_version' } });
  stores.sources.activate({ id: 's2', kind: 'PRICE', name: 'Development price', version: '2', location: 'fixture2', operatingContext: 'dev', freshnessPolicy: { mode: 'explicit_expiry' } });
  stores.sources.activate({ id: 's3', kind: 'INVENTORY', name: 'Development inventory', version: '1', location: 'fixture', operatingContext: 'dev', freshnessPolicy: { mode: 'max_age_minutes', value: 60 } });
  const rows = stores.sources.list();
  expect(rows.find(row => row.id === 's1').status).toBe('SUPERSEDED');
  expect(rows.find(row => row.id === 's2').status).toBe('ACTIVE');
  expect(rows.find(row => row.id === 's2').freshness_policy).not.toBe(rows.find(row => row.id === 's3').freshness_policy);
  db.close();
});

test('seed creates exactly nine canonical templates and PromptVersion is immutable', async () => {
  const { db, stores } = await fixture();
  seedDevelopment(db);
  seedDevelopment(db);
  const prompts = stores.prompts.list();
  expect(prompts).toHaveLength(9);
  expect(prompts.map(row => row.key).sort()).toEqual(PROMPTS.map(row => row[0]).sort());
  const version = stores.prompts.addVersion(prompts[0].id, 'نسخه توسعه دوم');
  expect(version.version).toBe(2);
  expect(() => db.prepare('update prompt_versions set content=? where id=?').run('overwrite', version.id)).toThrow();
  db.close();
});

test('jobs, steps and dependencies persist while WAITING/BLOCKED require reasons', async () => {
  const { db, stores } = await fixture();
  stores.jobs.create({ id: 'j1', subjectType: 'PRODUCT', subjectId: 'p1', jobType: 'PRODUCT_OPERATION' });
  stores.jobs.addStep({ id: 'a', jobId: 'j1', name: 'Source', status: 'SUCCEEDED' });
  stores.jobs.addStep({ id: 'b', jobId: 'j1', name: 'Generate', status: 'WAITING', reasonCode: 'WAITING_FOR_GENERATION_PROVIDER', humanMessage: 'Provider is not configured.' });
  stores.jobs.addDependency('b', 'a');
  expect(stores.jobs.graph('j1').dependencies).toHaveLength(1);
  expect(() => stores.jobs.addStep({ id: 'c', jobId: 'j1', name: 'Bad', status: 'BLOCKED' })).toThrow();
  db.close();
});

test('artifact states and QA evidence are constrained; audit is append-only', async () => {
  const { db, stores } = await fixture();
  stores.artifacts.create({ id: 'a1', artifactType: 'SHORT_DESCRIPTION', status: 'GENERATED', content: 'TEST' });
  expect(() => stores.artifacts.create({ id: 'a2', artifactType: 'X', status: 'APPROVED' })).toThrow();
  stores.qa.record({ id: 'q1', gate: 'DATA', checkKey: 'price', subjectType: 'PRODUCT', subjectId: 'p1', status: 'PASS', evidence: { source: 'TEST' } });
  expect(stores.qa.list()).toHaveLength(1);
  stores.audit.append({ id: 'e1', actor: 'system', action: 'SEEDED', subjectType: 'SYSTEM', subjectId: 'seed' });
  expect(() => stores.audit.update('e1')).toThrow('append-only');
  db.close();
});

test('Bun HTTP health, products and settings endpoints work and shutdown is graceful', async () => {
  const { db, stores } = await fixture();
  seedDevelopment(db);
  const server = createServer({ stores, publicDir: new URL('../public/', import.meta.url) });
  const base = server.url.origin;
  expect((await fetch(`${base}/health`)).status).toBe(200);
  expect(await (await fetch(`${base}/health`)).json()).toMatchObject({ status: 'ok', runtime: 'Bun' });
  expect((await fetch(`${base}/api/products`)).status).toBe(200);
  expect(await (await fetch(`${base}/api/prompts`)).json()).toHaveLength(9);
  expect(await (await fetch(`${base}/`)).text()).toContain('Boomerang Automation Studio');
  server.stop(true);
  db.close();
});

test('runtime database and production write adapters are absent from tracked design', async () => {
  const ignore = await readFile(new URL('../.gitignore', import.meta.url), 'utf8');
  expect(ignore).toContain('.runtime/');
  const pkg = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  expect(pkg).not.toMatch(/woocommerce|express|react|orm/i);
});
