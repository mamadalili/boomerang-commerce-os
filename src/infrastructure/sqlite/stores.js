import { randomUUID } from 'node:crypto';

const now = () => new Date().toISOString();

export function createStores(db) {
  return {
    products: {
      create(product) { db.prepare('INSERT INTO products(id,canonical_name,product_id,resolution_state,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(product.id, product.canonicalName, product.productId, product.resolutionState, now(), now()); },
      createVariant(variant) { db.prepare('INSERT INTO product_variants(id,product_id,sku,color,dimensions,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(variant.id, variant.productId, variant.sku, variant.color ?? null, variant.dimensions ?? null, now(), now()); },
      list: () => db.prepare('SELECT * FROM products ORDER BY created_at DESC').all(),
      get: id => db.prepare('SELECT * FROM products WHERE id=?').get(id),
      findByProductId: productId => db.prepare('SELECT * FROM products WHERE product_id=?').get(productId),
    },
    sources: {
      activate(source) {
        const dataMode = source.dataMode ?? 'AUTHORITATIVE';
        const freshnessPolicyVersion = source.freshnessPolicyVersion ?? '1';
        db.prepare("UPDATE authoritative_sources SET status='SUPERSEDED' WHERE kind=? AND operating_context=? AND status='ACTIVE'").run(source.kind, source.operatingContext);
        db.prepare('INSERT INTO authoritative_sources(id,kind,name,version,location,effective_at,imported_at,checksum,status,is_authoritative,operating_context,freshness_policy,freshness_policy_version,data_mode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(source.id, source.kind, source.name, source.version, source.location, source.effectiveAt ?? null, now(), source.checksum ?? null, 'ACTIVE', dataMode === 'AUTHORITATIVE' ? 1 : 0, source.operatingContext, JSON.stringify(source.freshnessPolicy), freshnessPolicyVersion, dataMode);
      },
      get: id => db.prepare('SELECT * FROM authoritative_sources WHERE id=?').get(id),
      list(filter = {}) {
        if (filter.kind && filter.operatingContext) return db.prepare('SELECT * FROM authoritative_sources WHERE kind=? AND operating_context=? ORDER BY imported_at DESC').all(filter.kind, filter.operatingContext);
        if (filter.kind) return db.prepare('SELECT * FROM authoritative_sources WHERE kind=? ORDER BY imported_at DESC').all(filter.kind);
        return db.prepare('SELECT * FROM authoritative_sources ORDER BY imported_at DESC').all();
      },
    },
    documents: {
      add(document) {
        const version = db.prepare('SELECT coalesce(max(version),0)+1 value FROM source_documents WHERE product_id=?').get(document.productId).value;
        db.prepare('INSERT INTO source_documents(id,product_id,job_id,version,filename,format,sha256,byte_size,raw_bytes,preview_json,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(document.id, document.productId, document.jobId, version, document.filename, document.format, document.sha256, document.byteSize, document.rawBytes, JSON.stringify(document.preview), document.status, now());
        return db.prepare('SELECT id,product_id,job_id,version,filename,format,sha256,byte_size,preview_json,status,created_at FROM source_documents WHERE id=?').get(document.id);
      },
      listByProduct: productId => db.prepare('SELECT id,product_id,job_id,version,filename,format,sha256,byte_size,preview_json,status,created_at FROM source_documents WHERE product_id=? ORDER BY version DESC').all(productId),
      listByJob: jobId => db.prepare('SELECT id,product_id,job_id,version,filename,format,sha256,byte_size,preview_json,status,created_at FROM source_documents WHERE job_id=? ORDER BY version DESC').all(jobId),
    },
    prompts: {
      list: () => db.prepare('SELECT t.*,max(v.version) current_version FROM prompt_templates t LEFT JOIN prompt_versions v ON v.prompt_template_id=t.id GROUP BY t.id ORDER BY t.key').all(),
      get: id => db.prepare('SELECT * FROM prompt_templates WHERE id=?').get(id),
      versions: id => db.prepare('SELECT * FROM prompt_versions WHERE prompt_template_id=? ORDER BY version DESC').all(id),
      addVersion(templateId, content, variables = [], settings = {}) { const version = db.prepare('SELECT coalesce(max(version),0)+1 n FROM prompt_versions WHERE prompt_template_id=?').get(templateId).n; const id = randomUUID(); db.prepare('INSERT INTO prompt_versions(id,prompt_template_id,version,content,variables,settings,created_at) VALUES(?,?,?,?,?,?,?)').run(id, templateId, version, content, JSON.stringify(variables), JSON.stringify(settings), now()); return { id, version }; },
    },
    jobs: {
      create(job) { db.prepare('INSERT INTO jobs(id,subject_type,subject_id,job_type,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(job.id, job.subjectType, job.subjectId, job.jobType, job.status ?? 'PENDING', now(), now()); },
      addStep(step) { const timestamp = now(); db.prepare('INSERT INTO job_steps(id,job_id,name,status,reason_code,human_message,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(step.id, step.jobId, step.name, step.status, step.reasonCode ?? null, step.humanMessage ?? null, timestamp, timestamp); },
      addDependency: (step, depends) => db.prepare('INSERT INTO step_dependencies VALUES(?,?)').run(step, depends),
      list: () => db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all(),
      get: id => db.prepare('SELECT * FROM jobs WHERE id=?').get(id),
      getStep: id => db.prepare('SELECT * FROM job_steps WHERE id=?').get(id),
      setWaitingReason(id, reasonCode, humanMessage) { db.prepare("UPDATE job_steps SET reason_code=?,human_message=?,updated_at=? WHERE id=? AND status='WAITING'").run(reasonCode, humanMessage, now(), id); },
      dependencies: id => db.prepare('SELECT s.* FROM step_dependencies d JOIN job_steps s ON s.id=d.depends_on_step_id WHERE d.job_step_id=? ORDER BY s.created_at,s.id').all(id),
      updateStatus(id, status) { db.prepare('UPDATE jobs SET status=?,updated_at=? WHERE id=?').run(status, now(), id); },
      transitionStep(change) {
        const timestamp = now();
        const timing = change.toStatus === 'READY' ? ',started_at=NULL,finished_at=NULL' : change.toStatus === 'RUNNING' ? ',started_at=?,finished_at=NULL' : ['SUCCEEDED', 'FAILED', 'CANCELLED', 'SKIPPED'].includes(change.toStatus) ? ',finished_at=?' : '';
        const values = [change.toStatus, change.reasonCode ?? null, change.humanMessage ?? null, change.evidenceReference ?? null, timestamp];
        if (timing.includes('?')) values.push(timestamp);
        values.push(change.stepId);
        db.prepare(`UPDATE job_steps SET status=?,reason_code=?,human_message=?,evidence_reference=?,updated_at=?${timing} WHERE id=?`).run(...values);
        db.prepare('INSERT INTO job_step_transitions(id,job_step_id,from_status,to_status,reason_code,human_message,evidence_reference,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(change.id, change.stepId, change.fromStatus, change.toStatus, change.reasonCode ?? null, change.humanMessage ?? null, change.evidenceReference ?? null, change.actor, timestamp);
      },
      transitions: stepId => db.prepare('SELECT * FROM job_step_transitions WHERE job_step_id=? ORDER BY created_at,id').all(stepId),
      graph: id => ({ steps: db.prepare('SELECT * FROM job_steps WHERE job_id=? ORDER BY created_at,id').all(id), dependencies: db.prepare('SELECT d.* FROM step_dependencies d JOIN job_steps s ON s.id=d.job_step_id WHERE s.job_id=?').all(id) }),
    },
    artifacts: { create: artifact => db.prepare('INSERT INTO artifacts(id,artifact_type,status,content,created_at) VALUES(?,?,?,?,?)').run(artifact.id, artifact.artifactType, artifact.status, artifact.content ?? null, now()) },
    qa: { record: result => db.prepare('INSERT INTO qa_results(id,gate,check_key,subject_type,subject_id,status,reason,evidence,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(result.id, result.gate, result.checkKey, result.subjectType, result.subjectId, result.status, result.reason ?? null, JSON.stringify(result.evidence ?? {}), now()), list: () => db.prepare('SELECT * FROM qa_results').all() },
    audit: {
      append: event => db.prepare('INSERT INTO audit_events(id,actor,action,subject_type,subject_id,timestamp,evidence_reference,metadata) VALUES(?,?,?,?,?,?,?,?)').run(event.id, event.actor, event.action, event.subjectType, event.subjectId, now(), event.evidenceReference ?? null, JSON.stringify(event.metadata ?? {})),
      list: subjectId => db.prepare('SELECT * FROM audit_events WHERE subject_id=? OR json_extract(metadata,\'$.jobId\')=? ORDER BY timestamp DESC').all(subjectId, subjectId),
      update: () => { throw new Error('AuditEvent is append-only'); },
    },
  };
}
