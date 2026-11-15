import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('Run timeline renders dependency labels from persisted StepDependency data', async () => {
  const source = await readFile(new URL('../public/views/run-detail.js', import.meta.url), 'utf8');
  expect(source).toContain('depends_on_step_id');
  expect(source).toContain('پس از');
  expect(source).toContain('run.dependencies');
});
