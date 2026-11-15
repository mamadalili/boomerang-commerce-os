const tabs = ['Overview','Sources','Commercial','Content','Media','SEO','Execution','Publication','History'];
export function renderProductWorkspace(model, escapeHtml, badge) {
  const product=model.product, latest=model.runs[0];
  return `<div class="workspace-header"><div><span class="eyebrow">PRODUCT WORKSPACE · ${escapeHtml(product.product_id)}</span><h2>${escapeHtml(product.canonical_name)}</h2><p>${escapeHtml(product.resolution_state)} · Revision ${product.revision}</p></div>${latest?badge(latest.status):''}</div>
  <div class="tabs" role="tablist">${tabs.map((tab,index)=>`<button role="tab" aria-selected="${index===0}" data-workspace-tab="${tab}">${tab}</button>`).join('')}</div>
  <section class="workspace-panel" id="workspace-panel"><div class="evidence-grid"><article><small>منابع</small><strong>${model.sources.length?'DEVELOPMENT / TEST':'پیکربندی نشده'}</strong></article><article><small>محتوا</small><strong>منتظر اتصال موتور تولید محتوا</strong></article><article><small>رسانه</small><strong>NOT CHECKED</strong></article><article><small>انتشار</small><strong>NOT CONNECTED</strong></article></div><div class="notice warning">هیچ Artifact یا validation تولیدی ساخته نشده است.</div></section>
  <script type="application/json" id="product-data">${JSON.stringify(model).replace(/</g,'\\u003c')}</script>`;
}
export function workspaceTab(tab, model, escapeHtml) {
  const messages={Overview:'هویت، وضعیت و شواهد محصول',Sources:'نسخه منابع استفاده‌شده در Run',Commercial:'قیمت مصرف‌کننده، فروش اینترنتی و موجودی',Content:'نام، توضیح کوتاه و توضیح کامل',Media:'Main Image، Color Variants، Real Space، Open State و Banner',SEO:'بسته SEO یکپارچه',Execution:'اجراها و dependencyها',Publication:'Fixture only · Production NOT CONNECTED',History:'AuditEventهای غیرقابل‌تغییر'};
  return `<div class="workspace-section"><span class="eyebrow">${escapeHtml(tab)}</span><h3>${escapeHtml(messages[tab])}</h3><p>${tab==='Content'||tab==='SEO'?'منتظر اتصال موتور تولید محتوا':tab==='Media'?'تمام بررسی‌های تصویری: NOT CHECKED':'داده‌ها فقط از وضعیت persisted خوانده می‌شوند.'}</p></div>`;
}
