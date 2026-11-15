import { createHash } from 'node:crypto';
import { readSheet } from 'read-excel-file/node';

const MAX_BYTES = 5 * 1024 * 1024;

export async function parseSourceFile({ name, bytes }) {
  const filename = String(name ?? '').split(/[\\/]/).at(-1)?.trim();
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (!raw.length) throw new Error('EMPTY_SOURCE_FILE');
  if (raw.length > MAX_BYTES) throw new Error('SOURCE_FILE_TOO_LARGE');
  const format = /\.md$/i.test(filename) ? 'MARKDOWN' : /\.xlsx$/i.test(filename) ? 'XLSX' : null;
  if (!format) throw new Error('UNSUPPORTED_SOURCE_FILE');
  let preview;
  if (format === 'MARKDOWN') {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
    catch { throw new Error('INVALID_MARKDOWN_ENCODING'); }
    if (!text.trim()) throw new Error('EMPTY_SOURCE_FILE');
    preview = { text: text.slice(0, 1800), truncated: text.length > 1800 };
  } else {
    try {
      const rows = await readSheet(Buffer.from(raw));
      if (!rows.length || rows.every(row => row.every(value => value == null || value === ''))) throw new Error('EMPTY_SOURCE_FILE');
      preview = { rows: rows.slice(0, 8).map(row => row.slice(0, 16)), rowCount: rows.length, truncated: rows.length > 8 };
    } catch (error) {
      if (error.message === 'EMPTY_SOURCE_FILE') throw error;
      throw new Error('INVALID_EXCEL_FILE');
    }
  }
  return { filename, format, sha256: createHash('sha256').update(raw).digest('hex'), byteSize: raw.length, rawBytes: raw, preview, status: 'UPLOADED_UNVERIFIED' };
}
