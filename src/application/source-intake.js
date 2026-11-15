import { randomUUID } from 'node:crypto';

const waitingMessage = 'فایل ثبت شد؛ داده‌های آن هنوز بررسی و به قیمت/موجودی رسمی تبدیل نشده‌اند.';

export function createSourceIntake({ db, stores }) {
  return {
    attach({ jobId, sourceDocument, actor = 'admin' }) {
      return db.transaction(() => {
        const job = stores.jobs.get(jobId);
        if (!job || job.subject_type !== 'PRODUCT') throw new Error('RUN_NOT_FOUND');
        const sourceStep = stores.jobs.graph(jobId).steps.find(step => step.name === 'Sources');
        if (!sourceStep || sourceStep.status !== 'WAITING') throw new Error('SOURCE_UPDATE_REQUIRES_NEW_RUN');
        const document = stores.documents.add({ ...sourceDocument, id: randomUUID(), productId: job.subject_id, jobId });
        stores.jobs.setWaitingReason(sourceStep.id, 'WAITING_FOR_SOURCE_REVIEW', waitingMessage);
        stores.audit.append({ id: randomUUID(), actor, action: 'SOURCE_DOCUMENT_UPLOADED', subjectType: 'PRODUCT', subjectId: job.subject_id, metadata: { jobId, documentId: document.id, version: document.version, filename: document.filename, sha256: document.sha256, status: document.status } });
        return document;
      })();
    },
  };
}
