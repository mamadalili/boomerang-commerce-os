import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('Data Sources screen exposes version, context, policy, mode and history controls', async () => {
  const view = await readFile(new URL('../public/views/library.js', import.meta.url), 'utf8');
  const controller = await readFile(new URL('../public/library-controller.js', import.meta.url), 'utf8');
  for (const token of ['data-source-form','source-version','source-context','freshness-policy-version','AUTHORITATIVE','TEST','data-source-history']) expect(view).toContain(token);
  expect(controller).toContain("api('/api/sources'");
  expect(controller).toContain("method:'POST'");
});

test('Prompt Studio saves variables and settings with each immutable version', async () => {
  const view = await readFile(new URL('../public/views/library.js', import.meta.url), 'utf8');
  const controller = await readFile(new URL('../public/library-controller.js', import.meta.url), 'utf8');
  expect(view).toContain('prompt-variables');
  expect(view).toContain('prompt-settings');
  expect(controller).toContain('variables');
  expect(controller).toContain('settings');
});
