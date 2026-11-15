import { resolve } from 'node:path';

export function loadConfig(env = process.env, runtime = {}) {
  const cwd = runtime.cwd ?? process.cwd();
  return {
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 4174),
    databasePath: resolve(cwd, env.DATABASE_PATH || '.runtime/commerce-os.sqlite'),
  };
}
