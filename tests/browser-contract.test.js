import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('responsive shell contains wide workflow and preserves accessible feedback', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = `${await readFile(new URL('../public/styles.css', import.meta.url), 'utf8')}\n${await readFile(new URL('../public/workspace.css', import.meta.url), 'utf8')}`;
  expect(html).toContain('name="viewport"');
  expect(html).toContain('aria-live="polite"');
  expect(html).toContain('<dialog');
  expect(css).toContain(':focus-visible');
  expect(css).toMatch(/@media\(max-width:700px\)/);
  expect(css).toContain('.workflow-canvas{');
  expect(css).toContain('overflow-x:auto');
  expect(css).toContain('overflow-x:hidden');
});
