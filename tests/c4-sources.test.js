import { test, expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { migrate } from '../src/infrastructure/sqlite/migrate.js';
import { createStores } from '../src/infrastructure/sqlite/stores.js';
import { createSourceService } from '../src/modules/sources/source-service.js';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'c4-sources-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  const stores = createStores(db);
  return { db, stores, service: createSourceService({ db, stores }) };
}

test('activating a source preserves history, policy version, truth mode and audit', async () => {
  const { db, stores, service } = await setup();
  service.activate({ kind: 'INVENTORY', name: 'انبار مرکزی', version: '2026-09-26.1', location: 'fixture://inventory-v1', operatingContext: 'default', freshnessPolicyVersion: 'inventory-v1', freshnessPolicy: { mode: 'max_age_minutes', value: 60 }, dataMode: 'TEST' }, 'admin');
  service.activate({ kind: 'INVENTORY', name: 'انبار مرکزی', version: '2026-09-26.2', location: 'fixture://inventory-v2', operatingContext: 'default', freshnessPolicyVersion: 'inventory-v1', freshnessPolicy: { mode: 'max_age_minutes', value: 30 }, dataMode: 'TEST' }, 'admin');
  const rows = stores.sources.list({ kind: 'INVENTORY', operatingContext: 'default' });
  expect(rows).toHaveLength(2);
  expect(rows.filter(row => row.status === 'ACTIVE')).toHaveLength(1);
  expect(rows.find(row => row.status === 'ACTIVE')).toMatchObject({ version: '2026-09-26.2', freshness_policy_version: 'inventory-v1', data_mode: 'TEST' });
  expect(stores.audit.list(rows.find(row => row.status === 'ACTIVE').id).map(event => event.action)).toContain('SOURCE_VERSION_ACTIVATED');
  db.close();
});

test('source service rejects freshness policies that do not match source kind', async () => {
  const { db, service } = await setup();
  expect(() => service.activate({ kind: 'INVENTORY', name: 'انبار', version: '1', location: 'x', operatingContext: 'default', freshnessPolicyVersion: '1', freshnessPolicy: { mode: 'valid_until_next_version' }, dataMode: 'AUTHORITATIVE' })).toThrow('INVALID_INVENTORY_FRESHNESS_POLICY');
  expect(() => service.activate({ kind: 'PRICE', name: 'قیمت', version: '1', location: 'x', operatingContext: 'default', freshnessPolicyVersion: '1', freshnessPolicy: { mode: 'max_age_minutes', value: 60 }, dataMode: 'AUTHORITATIVE' })).toThrow('INVALID_PRICE_FRESHNESS_POLICY');
  expect(() => service.activate({ kind: 'PRICE', name: 'قیمت', version: '1', location: 'x', operatingContext: 'default', freshnessPolicyVersion: '1', freshnessPolicy: { mode: 'explicit_expiry' }, dataMode: 'AUTHORITATIVE' })).toThrow('PRICE_EXPIRY_REQUIRED');
  db.close();
});
