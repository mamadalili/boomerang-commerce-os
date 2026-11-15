import { test, expect } from 'bun:test';
import { readFile } from 'node:fs/promises';

const file = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Studio shell exposes Persian operator navigation and accessible quick action', async () => {
  const html = await file('public/index.html');
  for (const label of ['امروز','اتوماسیون‌ها','اجراها','نیازمند تأیید','محصولات','انتشار','فایل‌ها','منابع داده','Prompt Studio','نقشه پروژه','تنظیمات']) expect(html).toContain(label);
  expect(html).toContain('+ اجرای اتوماسیون');
  expect(html).toContain('<dialog');
  expect(html).toContain('aria-live="polite"');
});

test('Studio client uses persisted APIs and does not execute future automations', async () => {
  const js = await file('public/app.js');
  for (const endpoint of ['/api/today','/api/automations','/api/runs']) expect(js).toContain(endpoint);
  expect(js).toContain('COMING_LATER');
  expect(js).toContain('location.hash');
  expect(js).not.toMatch(/fake|نمونه کارت/i);
});
