import { test, expect } from 'bun:test';
import { zipSync, strToU8 } from 'fflate';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/infrastructure/sqlite/database.js';
import { migrate } from '../src/infrastructure/sqlite/migrate.js';
import { createStores } from '../src/infrastructure/sqlite/stores.js';
import { createProductAutomationService } from '../src/application/product-automation.js';
import { createSourceIntake } from '../src/application/source-intake.js';
import { parseSourceFile } from '../src/modules/sources/parse-source-file.js';

function smallWorkbook() {
  const parts = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>product_name</t></is></c><c r="B1" t="inlineStr"><is><t>consumer_price</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>TORINO</t></is></c><c r="B2"><v>12500000</v></c></row></sheetData></worksheet>',
  };
  return zipSync(Object.fromEntries(Object.entries(parts).map(([name, xml]) => [name, strToU8(xml)])));
}

test('Markdown and Excel uploads yield inspectable previews without promoting unverified values', async () => {
  const markdown = await parseSourceFile({ name: 'TORINO.md', bytes: new TextEncoder().encode('# TORINO\nقیمت: ۱۲ میلیون تومان') });
  expect(markdown).toMatchObject({ format: 'MARKDOWN', status: 'UPLOADED_UNVERIFIED' });
  expect(markdown.preview.text).toContain('TORINO');
  const excel = await parseSourceFile({ name: 'products.xlsx', bytes: smallWorkbook() });
  expect(excel).toMatchObject({ format: 'XLSX', status: 'UPLOADED_UNVERIFIED' });
  expect(excel.preview.rows[1]).toEqual(['TORINO', 12500000]);
  expect(excel.sha256).toMatch(/^[a-f0-9]{64}$/);
});

test('unsupported and malformed uploads are rejected before a run is created', async () => {
  await expect(parseSourceFile({ name: 'prices.exe', bytes: new Uint8Array([1]) })).rejects.toThrow('UNSUPPORTED_SOURCE_FILE');
  await expect(parseSourceFile({ name: 'bad.xlsx', bytes: new Uint8Array([1,2,3]) })).rejects.toThrow('INVALID_EXCEL_FILE');
  await expect(parseSourceFile({ name: 'empty.md', bytes: new Uint8Array() })).rejects.toThrow('EMPTY_SOURCE_FILE');
});

test('one uploaded file is versioned with the product and stays unverified after an update', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'intake-'));
  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  const stores = createStores(db);
  const automation = createProductAutomationService({ db, stores });
  const intake = createSourceIntake({ db, stores });
  const first = await parseSourceFile({ name: 'TORINO.md', bytes: new TextEncoder().encode('# TORINO\nمرحله نخست') });
  const created = automation.start({ productName: 'TORINO', sourceDocument: first });
  expect(stores.documents.listByProduct(created.productId)).toHaveLength(1);
  expect(stores.documents.listByProduct(created.productId)[0]).toMatchObject({ version: 1, status: 'UPLOADED_UNVERIFIED', filename: 'TORINO.md' });
  const next = await parseSourceFile({ name: 'TORINO-v2.md', bytes: new TextEncoder().encode('# TORINO\nنسخه جدید') });
  intake.attach({ jobId: created.jobId, sourceDocument: next });
  expect(stores.documents.listByProduct(created.productId).map(row => row.version)).toEqual([2,1]);
  expect(stores.jobs.graph(created.jobId).steps.find(step => step.name === 'Sources')).toMatchObject({ status: 'WAITING', reason_code: 'WAITING_FOR_SOURCE_REVIEW' });
  expect(stores.audit.list(created.jobId).map(event => event.action)).toContain('SOURCE_DOCUMENT_UPLOADED');
  db.close();
});
