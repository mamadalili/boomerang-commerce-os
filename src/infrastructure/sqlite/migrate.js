import { readFileSync } from 'node:fs';

const migrations = [
  ['001_foundation', '../../../db/migrations/001_foundation.sql'],
  ['002_execution_kernel', '../../../db/migrations/002_execution_kernel.sql'],
  ['003_configuration_audit', '../../../db/migrations/003_configuration_audit.sql'],
  ['004_source_documents', '../../../db/migrations/004_source_documents.sql'],
];

export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const [version, path] of migrations) {
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(version)) continue;
    const sql = readFileSync(new URL(path, import.meta.url), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(version, new Date().toISOString());
    })();
  }
}
