import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('Project Intelligence embeds the preserved Phase 1 Graphify asset', async () => {
  const view = await readFile(new URL('../public/views/library.js', import.meta.url), 'utf8');
  const graph = await readFile(new URL('../public/project-intelligence/graph.html', import.meta.url), 'utf8');
  expect(view).toContain('/project-intelligence/graph.html');
  expect(view).toContain('<iframe');
  expect(graph).toContain('140 nodes');
  expect(graph).toContain('vis.Network');
});
