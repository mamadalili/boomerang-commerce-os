import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('Graphify iframe is usable at desktop and mobile widths', async () => {
  const css = await readFile(new URL('../public/library.css', import.meta.url), 'utf8');
  expect(css).toContain('.graph-frame');
  expect(css).toContain('width:100%');
  expect(css).toContain('min-height:70vh');
});
