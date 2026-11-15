const groups = {
  DISCOVERY: ['Product Resolution','Sources','Price','Inventory'],
  CONTENT: ['Product Name','Short Description','Full Description','SEO'],
  MEDIA: ['Main Image','Color Variants','Real Space','Open State','Banner'],
  QUALITY: ['Data QA','Content QA','Media QA'],
  PUBLICATION: ['Fixture Publish','Read-back','Verification','Publication QA'],
  APPROVAL: ['Final Approval','Report'],
};

const phases = [
  { title: '۱. شناخت و داده', groups: ['DISCOVERY'] },
  { title: '۲. تولید محتوا و تصویر', groups: ['CONTENT', 'MEDIA'] },
  { title: '۳. کنترل کیفیت', groups: ['QUALITY'] },
  { title: '۴. انتشار آزمایشی', groups: ['PUBLICATION'] },
  { title: '۵. تأیید و گزارش', groups: ['APPROVAL'] },
];

const phaseStatus = steps => {
  if (steps.every(step => ['SUCCEEDED', 'SKIPPED'].includes(step.status))) return 'SUCCEEDED';
  for (const status of ['FAILED', 'BLOCKED', 'WAITING', 'RUNNING', 'READY', 'PENDING', 'CANCELLED']) if (steps.some(step => step.status === status)) return status;
  return 'PENDING';
};

export function renderRunDetail(run, escapeHtml, badge) {
  const byName = new Map(run.steps.map(step => [step.name, step]));
  const byId = new Map(run.steps.map(step => [step.id, step]));
  const prerequisites = new Map(run.steps.map(step => [step.id, run.dependencies.filter(dependency => dependency.job_step_id === step.id).map(dependency => byId.get(dependency.depends_on_step_id)?.name).filter(Boolean)]));
  const document = run.sourceDocuments?.[0];
  let preview = null;
  try { preview = document?.preview_json ? JSON.parse(document.preview_json) : null; } catch {}
  const previewText = preview?.text ?? preview?.rows?.map(row => row.map(value => String(value ?? '')).join(' | ')).join('\n');
  const next = run.status === 'CANCELLED' ? 'این اجرا لغو شده است.' : document ? 'فایل منبع ثبت شد. تطبیق داده‌ها و کنترل قیمت و موجودی هنوز انجام نشده است.' : 'نام محصول ثبت شد. برای تکمیل منبع، یک فایل Markdown یا Excel اضافه کنید.';
  return `<div class="workspace-header"><div><span class="eyebrow">RUN #${escapeHtml(run.id.slice(0,8))} · ${escapeHtml(run.automationVersion)}</span><h2>${escapeHtml(run.subject)}</h2><p>${escapeHtml(run.automation)}</p></div>${badge(run.status)}</div>
  <div class="run-action-bar"><div><span class="eyebrow">وضعیت فعلی</span><p>${escapeHtml(next)}</p></div>${run.status !== 'CANCELLED' && run.status !== 'SUCCEEDED' ? `<button class="secondary danger" data-cancel-run="${escapeHtml(run.id)}">لغو اجرا</button>` : ''}</div>
  <div class="run-source-card"><div><span class="eyebrow">فایل منبع</span><h3>${document ? escapeHtml(document.filename) : 'هنوز فایلی اضافه نشده'}</h3><p>${document ? `نسخه ${document.version} · ثبت‌شده و بررسی‌نشده` : 'یک فایل ‎.md یا ‎.xlsx کافی است؛ داده‌ها پس از بررسی قابل استفاده می‌شوند.'}</p>${previewText ? `<details class="source-preview"><summary>پیش‌نمایش فایل</summary><pre>${escapeHtml(previewText)}</pre></details>` : ''}</div>${run.status !== 'CANCELLED' && run.status !== 'SUCCEEDED' ? `<label class="secondary upload-button">${document ? 'به‌روزرسانی فایل' : 'افزودن فایل'}<input type="file" accept=".md,.xlsx" data-source-file="${escapeHtml(run.id)}" hidden></label>` : ''}</div>
  <section class="phase-overview" aria-label="خلاصه مراحل">${phases.map(phase => { const steps = phase.groups.flatMap(group => groups[group].map(name => byName.get(name)).filter(Boolean)); const done = steps.filter(step => ['SUCCEEDED','SKIPPED'].includes(step.status)).length; const issue = steps.find(step => ['WAITING','BLOCKED','FAILED'].includes(step.status) && step.human_message); return `<article class="phase-card status-border-${phaseStatus(steps).toLowerCase()}"><div><strong>${phase.title}</strong>${badge(phaseStatus(steps))}</div><small>${done} از ${steps.length} مرحله انجام شده</small>${issue ? `<p>${escapeHtml(issue.human_message)}</p>` : ''}</article>`; }).join('')}</section>
  <details class="workflow-details"><summary>مرحله‌ها و وابستگی‌ها <small>نمای دقیق ۲۲ مرحله</small></summary><div class="workflow-canvas">${Object.entries(groups).map(([group,names])=>`<section class="workflow-group"><header><span>${group}</span><small>${names.length} مرحله</small></header><div class="step-track">${names.map(name=>{const step=byName.get(name);const depends=prerequisites.get(step.id);return `<button class="step status-border-${step.status.toLowerCase()}" data-step-id="${step.id}"><small>${escapeHtml(step.status)}</small><strong>${escapeHtml(step.name)}</strong>${depends.length?`<span>پس از: ${escapeHtml(depends.join('، '))}</span>`:''}${step.reason_code?`<span>${escapeHtml(step.reason_code)}</span>`:''}</button>`}).join('')}</div></section>`).join('')}</div></details>
  <aside class="inspector" id="step-inspector" aria-live="polite"><div class="panel-head"><h3>بازرس مرحله</h3><button class="icon-button" data-close-inspector>×</button></div><p>یک مرحله را برای مشاهده جزئیات انتخاب کنید.</p></aside>
  <script type="application/json" id="run-data">${JSON.stringify(run).replace(/</g,'\\u003c')}</script>`;
}

export function stepInspector(step, escapeHtml, badge) {
  return `<div class="panel-head"><div><span class="eyebrow">STEP INSPECTOR</span><h3>${escapeHtml(step.name)}</h3></div><button class="icon-button" data-close-inspector>×</button></div>${badge(step.status)}
  <dl class="inspector-list"><div><dt>Status</dt><dd>${escapeHtml(step.status)}</dd></div><div><dt>Waiting reason</dt><dd>${escapeHtml(step.reason_code || '—')}</dd></div><div><dt>توضیح</dt><dd>${escapeHtml(step.human_message || '—')}</dd></div><div><dt>SourceReference</dt><dd>پیکربندی نشده</dd></div><div><dt>PromptVersion</dt><dd>متصل نشده</dd></div><div><dt>Artifact validation</dt><dd>NOT CHECKED</dd></div></dl><div class="notice">اقدام بعدی: ${step.status==='WAITING'?'پیکربندی منبع یا provider لازم است.':'وابستگی‌های قبلی باید تکمیل شوند.'}</div>`;
}
