import { Database } from 'bun:sqlite';

export function openDatabase(path) {
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

  return {
    exec: sql => sqlite.exec(sql),
    prepare: sql => sqlite.query(sql),
    transaction: fn => sqlite.transaction(fn),
    pragma(statement, { simple = false } = {}) {
      if (statement.includes('=')) {
        sqlite.exec(`PRAGMA ${statement}`);
        return undefined;
      }
      const row = sqlite.query(`PRAGMA ${statement}`).get();
      return simple ? Object.values(row)[0] : row;
    },
    close: () => sqlite.close(),
  };
}
