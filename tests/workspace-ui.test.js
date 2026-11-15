import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('Run Detail groups the persisted workflow and exposes a Step Inspector', async () => {
  const source = await readFile(new URL('../public/views/run-detail.js', import.meta.url), 'utf8');
  for (const group of ['DISCOVERY','CONTENT','MEDIA','QUALITY','PUBLICATION','APPROVAL']) expect(source).toContain(group);
  for (const field of ['reason_code','human_message','PromptVersion','SourceReference','NOT CHECKED']) expect(source).toContain(field);
  expect(source).toContain('data-step-id');
});

test('Product Workspace preserves all operator sections and honest unavailable states', async () => {
  const source = await readFile(new URL('../public/views/product-workspace.js', import.meta.url), 'utf8');
  for (const tab of ['Overview','Sources','Commercial','Content','Media','SEO','Execution','Publication','History']) expect(source).toContain(tab);
  expect(source).toContain('منتظر اتصال موتور تولید محتوا');
  expect(source).not.toContain('✓');
});
