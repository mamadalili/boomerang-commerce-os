import { test, expect } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { migrate } from '../src/infrastructure/sqlite/migrate.js';
import { seedDevelopment } from '../src/infrastructure/sqlite/seed.js';
import { createStores } from '../src/infrastructure/sqlite/stores.js';
import { createPromptService } from '../src/modules/prompts/prompt-service.js';

test('saving a prompt creates an immutable auditable version with variables and settings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'c4-prompts-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db); seedDevelopment(db);
  const stores = createStores(db);
  const service = createPromptService({ db, stores });
  const templateId = 'product:short_description';
  const saved = service.createVersion({ templateId, content: 'برای {{product_name}} بنویس.', variables: ['product_name'], settings: { locale: 'fa-IR' } }, 'admin');
  expect(saved.version).toBe(2);
  const current = stores.prompts.versions(templateId)[0];
  expect(JSON.parse(current.variables)).toEqual(['product_name']);
  expect(JSON.parse(current.settings)).toEqual({ locale: 'fa-IR' });
  expect(() => db.prepare('UPDATE prompt_versions SET content=? WHERE id=?').run('overwrite', saved.id)).toThrow();
  expect(stores.audit.list(templateId).map(event => event.action)).toContain('PROMPT_VERSION_CREATED');
  db.close();
});

test('prompt service rejects unknown templates and malformed configuration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'c4-prompts-invalid-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db); seedDevelopment(db);
  const stores = createStores(db);
  const service = createPromptService({ db, stores });
  expect(() => service.createVersion({ templateId: 'missing', content: 'x', variables: [], settings: {} })).toThrow('PROMPT_TEMPLATE_NOT_FOUND');
  expect(() => service.createVersion({ templateId: 'product:short_description', content: ' ', variables: [], settings: {} })).toThrow('PROMPT_CONTENT_REQUIRED');
  expect(() => service.createVersion({ templateId: 'product:short_description', content: 'x', variables: 'bad', settings: {} })).toThrow('PROMPT_VARIABLES_INVALID');
  db.close();
});
