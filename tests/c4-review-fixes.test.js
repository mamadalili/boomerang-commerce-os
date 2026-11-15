import { test, expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { migrate } from '../src/infrastructure/sqlite/migrate.js';
import { createStores } from '../src/infrastructure/sqlite/stores.js';
import { createSourceService } from '../src/modules/sources/source-service.js';
import { renderSources } from '../public/views/library.js';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'c4-review-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  const stores = createStores(db);
  return { db, stores, service: createSourceService({ db, stores }) };
}

test('TEST activation uses neutral audit semantics instead of claiming authoritative data', async () => {
  const { db, stores, service } = await setup();
  const source = service.activate({ kind: 'INVENTORY', name: 'تست انبار', version: '1', location: 'fixture://inventory', operatingContext: 'default', freshnessPolicyVersion: '1', freshnessPolicy: { mode: 'max_age_minutes', value: 30 }, dataMode: 'TEST' }, 'admin');
  const event = stores.audit.list(source.id)[0];
  expect(event).toMatchObject({ action: 'SOURCE_VERSION_ACTIVATED', subject_type: 'SOURCE_VERSION' });
  expect(event.action).not.toContain('AUTHORITATIVE');
  db.close();
});

test('explicit price expiry must be a future timestamp and is normalized', async () => {
  const { db, service } = await setup();
  const base = { kind: 'PRICE', name: 'قیمت', version: '1', location: 'file://price', operatingContext: 'default', freshnessPolicyVersion: '1', dataMode: 'AUTHORITATIVE' };
  expect(() => service.activate({ ...base, freshnessPolicy: { mode: 'explicit_expiry', expiresAt: 'not-a-date' } })).toThrow('PRICE_EXPIRY_INVALID');
  expect(() => service.activate({ ...base, freshnessPolicy: { mode: 'explicit_expiry', expiresAt: '2020-01-01T00:00:00Z' } })).toThrow('PRICE_EXPIRY_EXPIRED');
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  const source = service.activate({ ...base, freshnessPolicy: { mode: 'explicit_expiry', expiresAt } });
  expect(JSON.parse(source.freshness_policy).expiresAt).toBe(expiresAt);
  db.close();
});

test('Sources UI renders active state and history separately for every operating context', () => {
  const rows = [
    { id: 'a', kind: 'PRICE', version: '1', status: 'ACTIVE', operating_context: 'default', freshness_policy_version: '1', freshness_policy: '{}', data_mode: 'AUTHORITATIVE', imported_at: '2026-09-26' },
    { id: 'b', kind: 'PRICE', version: '2', status: 'ACTIVE', operating_context: 'storefront', freshness_policy_version: '2', freshness_policy: '{}', data_mode: 'TEST', imported_at: '2026-09-26' },
  ];
  const html = renderSources(rows);
  expect(html).toContain('data-source-context="default"');
  expect(html).toContain('data-source-context="storefront"');
  expect((html.match(/data-source-history="PRICE:/g) ?? [])).toHaveLength(2);
});
