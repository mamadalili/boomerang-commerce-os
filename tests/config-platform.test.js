import { test, expect } from 'bun:test';
import { loadConfig } from '../src/config.js';

test('WSL Bun runtime uses a configurable repository-local database by default', () => {
  const config = loadConfig({}, { cwd: '/home/hp/projects/boomerang-commerce-os' });
  expect(config.databasePath).toBe('/home/hp/projects/boomerang-commerce-os/.runtime/commerce-os.sqlite');
  const custom = loadConfig({ DATABASE_PATH: '/tmp/commerce-os.sqlite' }, { cwd: '/workspace' });
  expect(custom.databasePath).toBe('/tmp/commerce-os.sqlite');
});
