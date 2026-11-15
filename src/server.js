import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSourceFile } from './modules/sources/parse-source-file.js';

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const json = (data, status = 200) => Response.json(data, { status });
async function body(request) {
  const text = await request.text();
  if (text.length > 64_000) throw Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 });
  try { return text ? JSON.parse(text) : {}; }
  catch { throw Object.assign(new Error('INVALID_JSON'), { status: 400 }); }
}
async function sourceForm(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 6 * 1024 * 1024) throw Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 });
  let form;
  try { form = await request.formData(); }
  catch { throw Object.assign(new Error('INVALID_FORM'), { status: 400 }); }
  const file = form.get('sourceFile');
  const sourceDocument = file instanceof File && file.name ? await parseSourceFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }) : null;
  return { productName: form.get('productName'), sourceDocument };
}
const fileErrors = new Set(['EMPTY_SOURCE_FILE','UNSUPPORTED_SOURCE_FILE','INVALID_MARKDOWN_ENCODING','INVALID_EXCEL_FILE']);
const executionErrors = new Map([['STEP_NOT_FOUND',404],['ILLEGAL_STEP_TRANSITION',409],['DEPENDENCIES_NOT_SATISFIED',409],['STEP_REASON_REQUIRED',400],['JOB_CANCELLED',409],['RUN_NOT_CANCELLABLE',409],['RUN_NOT_FOUND',404]]);
const configurationErrors = new Set(['SOURCE_FIELD_REQUIRED','SOURCE_KIND_INVALID','SOURCE_DATA_MODE_INVALID','INVALID_INVENTORY_FRESHNESS_POLICY','INVALID_PRICE_FRESHNESS_POLICY','PRICE_EXPIRY_REQUIRED','PROMPT_CONTENT_REQUIRED','PROMPT_VARIABLES_INVALID','PROMPT_SETTINGS_INVALID']);

export function createServer({ stores, execution, sourceService, sourceIntake, promptService, automation, queries, publicDir, hostname = '127.0.0.1', port = 0 }) {
  const root = fileURLToPath(publicDir);
  return Bun.serve({ hostname, port, async fetch(request) {
    try {
      const url = new URL(request.url), path = url.pathname;
      if (path === '/health') return json({ status: 'ok', database: 'ready', mode: 'DEVELOPMENT', runtime: 'Bun' });
      if (path === '/api/products' && request.method === 'GET') return json(stores.products.list());
      if (path === '/api/prompts' && request.method === 'GET') return json(stores.prompts.list());
      if (path === '/api/sources' && request.method === 'GET') return json(stores.sources.list({ kind: url.searchParams.get('kind') || undefined, operatingContext: url.searchParams.get('context') || undefined }));
      if (path === '/api/sources' && request.method === 'POST' && sourceService) { try { return json(sourceService.activate(await body(request), 'admin'), 201); } catch (error) { if (configurationErrors.has(error.message)) return json({ error: error.message }, 400); throw error; } }
      if (path === '/api/today' && queries) return json(queries.today());
      if (path === '/api/automations' && queries) return json(queries.automations());
      if (path === '/api/runs' && request.method === 'GET' && queries) return json(queries.runs());
      if (path === '/api/runs' && request.method === 'POST' && automation) {
        const input = request.headers.get('content-type')?.startsWith('multipart/form-data') ? await sourceForm(request) : await body(request);
        try { return json(automation.start({ productName: input.productName, sourceDocument: input.sourceDocument, actor: 'admin' }), 201); }
        catch (error) { if (error.message === 'PRODUCT_NAME_REQUIRED') return json({ error: error.message, message: 'نام محصول الزامی است.' }, 400); throw error; }
      }
      let match = path.match(/^\/api\/runs\/([^/]+)\/source-documents$/);
      if (match && request.method === 'POST' && sourceIntake) {
        const input = await sourceForm(request);
        if (!input.sourceDocument) return json({ error: 'SOURCE_FILE_REQUIRED' }, 400);
        try { return json(sourceIntake.attach({ jobId: decodeURIComponent(match[1]), sourceDocument: input.sourceDocument, actor: 'admin' }), 201); }
        catch (error) { if (error.message === 'RUN_NOT_FOUND') return json({ error: error.message }, 404); if (error.message === 'SOURCE_UPDATE_REQUIRES_NEW_RUN') return json({ error: error.message }, 409); throw error; }
      }
      match = path.match(/^\/api\/runs\/([^/]+)\/cancel$/);
      if (match && request.method === 'POST' && execution) { try { return json(execution.cancel(decodeURIComponent(match[1]), 'admin')); } catch (error) { const status = executionErrors.get(error.message); if (status) return json({ error: error.message }, status); throw error; } }
      match = path.match(/^\/api\/runs\/([^/]+)\/steps\/([^/]+)\/transitions$/);
      if (match && request.method === 'GET') return json(stores.jobs.transitions(decodeURIComponent(match[2])));
      if (match && request.method === 'POST' && execution) { const input = await body(request); try { return json(execution.transition({ jobId: decodeURIComponent(match[1]), stepId: decodeURIComponent(match[2]), toStatus: input.toStatus, reasonCode: input.reasonCode, humanMessage: input.humanMessage, evidenceReference: input.evidenceReference, actor: 'admin' })); } catch (error) { const status = executionErrors.get(error.message); if (status) return json({ error: error.message }, status); throw error; } }
      match = path.match(/^\/api\/runs\/([^/]+)$/); if (match && queries) { const result = queries.run(decodeURIComponent(match[1])); return result ? json(result) : json({ error: 'not_found' }, 404); }
      match = path.match(/^\/api\/products\/([^/]+)$/); if (match && queries) { const result = queries.product(decodeURIComponent(match[1])); return result ? json(result) : json({ error: 'not_found' }, 404); }
      match = path.match(/^\/api\/prompts\/([^/]+)\/versions$/);
      if (match && request.method === 'POST') { const input = await body(request), templateId = decodeURIComponent(match[1]); try { if (promptService) return json(promptService.createVersion({ templateId, content: input.content, variables: input.variables, settings: input.settings }, 'admin'), 201); if (!stores.prompts.get(templateId)) return json({ error: 'not_found' }, 404); return json(stores.prompts.addVersion(templateId, input.content.trim()), 201); } catch (error) { if (error.message === 'PROMPT_TEMPLATE_NOT_FOUND') return json({ error: 'not_found' }, 404); if (configurationErrors.has(error.message)) return json({ error: error.message }, 400); throw error; } }
      match = path.match(/^\/api\/prompts\/([^/]+)$/); if (match && queries) { const result = queries.prompt(decodeURIComponent(match[1])); return result ? json(result) : json({ error: 'not_found' }, 404); }
      const asset = path === '/' ? 'index.html' : path.slice(1); if (asset.includes('..')) return json({ error: 'invalid_path' }, 400); const file = await readFile(join(root, asset)); return new Response(file, { headers: { 'content-type': types[extname(asset)] || 'application/octet-stream' } });
    } catch (error) { if (error.code === 'ENOENT') return json({ error: 'not_found' }, 404); if (fileErrors.has(error.message)) return json({ error: error.message }, 400); if (error.message === 'SOURCE_FILE_TOO_LARGE') return json({ error: error.message }, 413); return json({ error: 'internal_error', message: error.message }, error.status ?? 500); }
  }, error: error => json({ error: 'internal_error', message: error.message }, 500) });
}
