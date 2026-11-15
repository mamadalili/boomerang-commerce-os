import { randomUUID } from 'node:crypto';

const groups = [
  ['DISCOVERY', ['Product Resolution', 'Sources', 'Price', 'Inventory']],
  ['CONTENT', ['Product Name', 'Short Description', 'Full Description', 'SEO']],
  ['MEDIA', ['Main Image', 'Color Variants', 'Real Space', 'Open State', 'Banner']],
  ['QUALITY', ['Data QA', 'Content QA', 'Media QA']],
  ['PUBLICATION', ['Fixture Publish', 'Read-back', 'Verification', 'Publication QA']],
  ['APPROVAL', ['Final Approval', 'Report']],
];

export const PRODUCT_WORKFLOW = groups.flatMap(([group, names]) => names.map(name => ({ group, name })));

const key = value => value.trim().replace(/\s+/g, '-').toUpperCase();

export function createProductAutomationService({ db, stores }) {
  return {
    start({ productName, sourceDocument, actor = 'operator' }) {
      const canonicalName = productName?.trim();
      if (!canonicalName) throw new Error('PRODUCT_NAME_REQUIRED');
      return db.transaction(() => {
        const externalId = key(canonicalName);
        let product = stores.products.findByProductId(externalId);
        if (!product) {
          const id = randomUUID();
          stores.products.create({ id, canonicalName, productId: externalId, resolutionState: 'NEW_PRODUCT' });
          product = stores.products.get(id);
        }
        const jobId = randomUUID();
        stores.jobs.create({ id: jobId, subjectType: 'PRODUCT', subjectId: product.id, jobType: 'PRODUCT_AUTOMATION', status: 'WAITING' });
        const ids = new Map();
        for (const step of PRODUCT_WORKFLOW) {
          const id = randomUUID();
          ids.set(step.name, id);
          const waiting = step.name === 'Sources';
          stores.jobs.addStep({
            id,
            jobId,
            name: step.name,
            status: step.name === 'Product Resolution' ? 'READY' : waiting ? 'WAITING' : 'PENDING',
            reasonCode: waiting ? sourceDocument ? 'WAITING_FOR_SOURCE_REVIEW' : 'SOURCE_CONFIGURATION_REQUIRED' : null,
            humanMessage: waiting ? sourceDocument ? 'فایل ثبت شد؛ داده‌های آن هنوز بررسی و به قیمت/موجودی رسمی تبدیل نشده‌اند.' : 'برای ادامه، فایل منبع محصول را اضافه کنید.' : null,
          });
        }
        const depend = (name, ...requirements) => requirements.forEach(required => stores.jobs.addDependency(ids.get(name), ids.get(required)));
        depend('Sources', 'Product Resolution');
        for (const name of ['Price','Inventory','Product Name','Short Description','Full Description','SEO','Main Image','Color Variants','Real Space','Open State','Banner']) depend(name, 'Sources');
        depend('Data QA', 'Price', 'Inventory');
        depend('Content QA', 'Product Name', 'Short Description', 'Full Description', 'SEO');
        depend('Media QA', 'Main Image', 'Color Variants', 'Real Space', 'Open State', 'Banner');
        depend('Fixture Publish', 'Data QA', 'Content QA', 'Media QA');
        depend('Read-back', 'Fixture Publish');
        depend('Verification', 'Read-back');
        depend('Publication QA', 'Verification');
        depend('Final Approval', 'Publication QA');
        depend('Report', 'Final Approval');
        if (sourceDocument) {
          const document = stores.documents.add({ ...sourceDocument, id: randomUUID(), productId: product.id, jobId });
          stores.audit.append({ id: randomUUID(), actor, action: 'SOURCE_DOCUMENT_UPLOADED', subjectType: 'PRODUCT', subjectId: product.id, metadata: { jobId, documentId: document.id, version: document.version, filename: document.filename, sha256: document.sha256, status: document.status } });
        }
        stores.audit.append({ id: randomUUID(), actor, action: 'PRODUCT_AUTOMATION_STARTED', subjectType: 'PRODUCT', subjectId: product.id, metadata: { jobId, productName: canonicalName, mode: 'DEVELOPMENT' } });
        return { productId: product.id, jobId };
      })();
    },
  };
}
