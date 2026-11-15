import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';

test('Library workspaces preserve prompts, source operations and honest integrations', async () => {
  const source = await readFile(new URL('../public/views/library.js', import.meta.url), 'utf8');
  for (const key of ['product_name','short_description','full_description','seo_package','main_product_image','color_variant_image','real_space_gallery','open_state_image','product_page_banner']) expect(source).toContain(key);
  for (const phrase of ['Save New Version','Test Prompt','آپلود نسخه جدید','مشاهده تاریخچه','NOT CONNECTED','تأیید نهایی هنوز فعال نیست','Graphify']) expect(source).toContain(phrase);
  expect(source).not.toContain('✓ PASS');
});

test('Prompt version editor calls the immutable version endpoint', async () => {
  const source = await readFile(new URL('../public/library-controller.js', import.meta.url), 'utf8');
  expect(source).toContain('/versions');
  expect(source).toContain("method:'POST'");
});
