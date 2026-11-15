import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('Today empty state renders directly without optional join artifacts', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  expect(source).not.toContain('.join?.');
  expect(source).toContain("data.runs.length ? data.runs.map(runCard).join('') : empty(");
});
